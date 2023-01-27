/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { PortfolioAssociationConfig, PortfolioConfig, ProductConfig } from '@aws-accelerator/config';
import { IdentityCenterGetPermissionRoleArn, Organization, SharePortfolioWithOrg } from '@aws-accelerator/constructs';

export class CustomizationsStack extends AcceleratorStack {
  /**
   * StackSet Administrator Account Id
   */
  private stackSetAdministratorAccount: string;

  /**
   * AWS Organization Id
   */
  private organizationId: string;

  /**
   * KMS Key used to encrypt CloudWatch logs
   */
  private cloudwatchKey: cdk.aws_kms.Key;

  /**
   * Constructor for CustomizationsStack
   *
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    this.props = props;
    this.stackSetAdministratorAccount = props.accountsConfig.getManagementAccountId();
    this.organizationId = props.organizationConfig.enable ? new Organization(this, 'Organization').id : '';
    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    ) as cdk.aws_kms.Key;

    // Create CloudFormation StackSets
    if (props.customizationsConfig?.customizations?.cloudFormationStackSets) {
      this.deployCustomStackSets();
    }

    // Create Service Catalog Portfolios
    if (props.customizationsConfig?.customizations?.serviceCatalogPortfolios?.length > 0) {
      this.createServiceCatalogResources();
    }

    this.logger.info('Completed stack synthesis');
  }

  //
  // Create custom CloudFormation StackSets
  //
  private deployCustomStackSets() {
    this.logger.info(`[customizations-stack] Deploying CloudFormation StackSets`);
    if (
      this.account === this.stackSetAdministratorAccount &&
      this.props.globalConfig.homeRegion == cdk.Stack.of(this).region &&
      this.props.customizationsConfig?.customizations?.cloudFormationStackSets
    ) {
      const customStackSetList = this.props.customizationsConfig.customizations.cloudFormationStackSets;
      for (const stackSet of customStackSetList ?? []) {
        this.logger.info(`New stack set ${stackSet.name}`);
        const deploymentTargetAccounts: string[] | undefined = this.getAccountIdsFromDeploymentTarget(
          stackSet.deploymentTargets,
        );
        const templateBody = fs.readFileSync(path.join(this.props.configDirPath, stackSet.template), 'utf-8');

        new cdk.aws_cloudformation.CfnStackSet(this, pascalCase(`AWSAccelerator-Custom-${stackSet.name}`), {
          permissionModel: 'SELF_MANAGED',
          stackSetName: stackSet.name,
          capabilities: stackSet.capabilities,
          description: stackSet.description,
          operationPreferences: {
            failureTolerancePercentage: 25,
            maxConcurrentPercentage: 35,
            regionConcurrencyType: 'PARALLEL',
          },
          stackInstancesGroup: [
            {
              deploymentTargets: {
                accounts: deploymentTargetAccounts,
              },
              regions: stackSet.regions,
            },
          ],
          templateBody: templateBody,
        });
      }
    }
  }

  /**
   * Create Service Catalog resources
   */
  private createServiceCatalogResources() {
    const serviceCatalogPortfolios = this.props.customizationsConfig?.customizations?.serviceCatalogPortfolios;
    for (const portfolioItem of serviceCatalogPortfolios ?? []) {
      const regions = portfolioItem.regions.map(item => {
        return item.toString();
      });
      const accountId = this.props.accountsConfig.getAccountId(portfolioItem.account);
      if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
        // Create portfolios
        const portfolio = this.createPortfolios(portfolioItem);

        // Create portfolio shares
        this.createPortfolioShares(portfolio, portfolioItem);

        // Create products for the portfolio
        this.createPortfolioProducts(portfolio, portfolioItem);

        // Create portfolio associations
        this.createPortfolioAssociations(portfolio, portfolioItem);
      }
    }
  }

  /**
   * Create Service Catalog portfolios
   * @param portfolio
   * @param portfolioItem
   */
  private createPortfolios(portfolioItem: PortfolioConfig): cdk.aws_servicecatalog.Portfolio {
    this.logger.info(`Creating Service Catalog portfolio ${portfolioItem.name}`);

    // Create portfolio TagOptions
    let tagOptions: cdk.aws_servicecatalog.TagOptions | undefined = undefined;
    if (portfolioItem.tagOptions) {
      const tagOptionsTags: { [key: string]: string[] } = {};
      portfolioItem.tagOptions.forEach(tag => (tagOptionsTags[tag.key] = tag.values));
      tagOptions = new cdk.aws_servicecatalog.TagOptions(this, pascalCase(`${portfolioItem.name}TagOptions`), {
        allowedValuesForTags: tagOptionsTags,
      });
    }

    // Create portfolio
    const portfolio = new cdk.aws_servicecatalog.Portfolio(this, pascalCase(`${portfolioItem.name}Portfolio`), {
      displayName: portfolioItem.name,
      providerName: portfolioItem.provider,
      tagOptions,
    });

    this.ssmParameters.push({
      logicalId: pascalCase(`SsmParam${portfolioItem.name}PortfolioId`),
      parameterName: `/accelerator/servicecatalog/portfolios/${portfolioItem.name}/id`,
      stringValue: portfolio.portfolioId,
    });
    return portfolio;
  }

  /**
   * Create account and OU-level Service Catalog portfolio shares
   * @param portfolio
   * @param portfolioItem
   */
  private createPortfolioShares(portfolio: cdk.aws_servicecatalog.Portfolio, portfolioItem: PortfolioConfig): void {
    // Create account shares
    if (portfolioItem.shareTargets) {
      // share portfolio with accounts via native CDK
      for (const account of portfolioItem?.shareTargets?.accounts ?? []) {
        const accountId = this.props.accountsConfig.getAccountId(account);
        if (accountId !== cdk.Stack.of(this).account) {
          portfolio.shareWithAccount(accountId, { shareTagOptions: portfolioItem.shareTagOptions ?? false });
        }
      }

      // share portfolio with organizational units via Custom Resource
      const managementAccountId = this.props.accountsConfig.getManagementAccountId();
      if (cdk.Stack.of(this).account === managementAccountId) {
        const organizationalUnitIds: string[] = [];
        let shareToEntireOrg = false;
        for (const ou of portfolioItem?.shareTargets?.organizationalUnits ?? []) {
          if (ou === 'Root') {
            shareToEntireOrg = true;
          } else {
            organizationalUnitIds.push(this.props.organizationConfig.getOrganizationalUnitId(ou));
          }
        }
        if (organizationalUnitIds.length > 0 || shareToEntireOrg) {
          const portfolioOrgShare = new SharePortfolioWithOrg(this, `${portfolioItem.name}-Share`, {
            portfolioId: portfolio.portfolioId,
            organizationalUnitIds: organizationalUnitIds,
            tagShareOptions: portfolioItem.shareTagOptions ?? false,
            organizationId: shareToEntireOrg ? this.organizationId : '',
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
          portfolioOrgShare.node.addDependency(portfolio);
        }
      }
    }
  }

  /**
   * Create Service Catalog products
   * @param portfolio
   * @param portfolioItem
   */
  private createPortfolioProducts(portfolio: cdk.aws_servicecatalog.Portfolio, portfolioItem: PortfolioConfig): void {
    // Get the Product Version list
    for (const productItem of portfolioItem.products ?? []) {
      const productVersions = this.getPortfolioProductVersions(productItem);

      // Create product TagOptions
      const tagOptions = this.getPortfolioProductTagOptions(productItem);

      //Create a Service Catalog Cloudformation Product.
      this.logger.info(`Creating product ${productItem.name} in Service Catalog portfolio ${portfolioItem.name}`);
      const product = new cdk.aws_servicecatalog.CloudFormationProduct(
        this,
        pascalCase(`${portfolioItem.name}Portfolio${productItem.name}Product`),
        {
          productName: productItem.name,
          owner: productItem.owner,
          distributor: productItem.distributor,
          productVersions,
          description: productItem.description,
          supportDescription: productItem.support?.description,
          supportEmail: productItem.support?.email,
          supportUrl: productItem.support?.url,
          tagOptions,
        },
      );

      //Associate Portfolio with the Product.
      portfolio.addProduct(product);
    }
  }

  /**
   * Get list of Service Catalog portfolio product versions
   * @param portfolio
   * @param portfolioItem
   */
  private getPortfolioProductVersions(
    productItem: ProductConfig,
  ): cdk.aws_servicecatalog.CloudFormationProductVersion[] {
    const productVersions: cdk.aws_servicecatalog.CloudFormationProductVersion[] = [];
    for (const productVersionItem of productItem.versions ?? []) {
      productVersions.push({
        productVersionName: productVersionItem.name,
        description: productVersionItem.description,
        cloudFormationTemplate: cdk.aws_servicecatalog.CloudFormationTemplate.fromAsset(
          path.join(this.props.configDirPath, productVersionItem.template),
        ),
        validateTemplate: true,
      });
    }
    return productVersions;
  }

  /**
   * Get Service Catalog tag options
   * @param portfolio
   * @param portfolioItem
   */
  private getPortfolioProductTagOptions(productItem: ProductConfig): cdk.aws_servicecatalog.TagOptions | undefined {
    let tagOptions: cdk.aws_servicecatalog.TagOptions | undefined = undefined;
    if (productItem.tagOptions) {
      const tagOptionsTags: { [key: string]: string[] } = {};
      productItem.tagOptions.forEach(tag => (tagOptionsTags[tag.key] = tag.values));
      tagOptions = new cdk.aws_servicecatalog.TagOptions(this, pascalCase(`${productItem.name}TagOptions`), {
        allowedValuesForTags: tagOptionsTags,
      });
    }
    return tagOptions;
  }

  private createPortfolioAssociations(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
  ): void {
    // Add portfolio Associations
    for (const portfolioAssociationItem of portfolioItem.portfolioAssociations ?? []) {
      if (portfolioAssociationItem.type === 'Group') {
        this.createPortfolioAssociationForGroup(portfolio, portfolioItem, portfolioAssociationItem);
      } else if (portfolioAssociationItem.type === 'Role') {
        this.createPortfolioAssociationForRole(portfolio, portfolioItem, portfolioAssociationItem);
      } else if (portfolioAssociationItem.type === 'User') {
        this.createPortfolioAssociationForUser(portfolio, portfolioItem, portfolioAssociationItem);
      } else if (portfolioAssociationItem.type === 'PermissionSet') {
        this.createPortfolioAssociationForPermissionSet(portfolio, portfolioItem, portfolioAssociationItem);
      }
    }
  }

  private createPortfolioAssociationForGroup(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
    portfolioAssociationItem: PortfolioAssociationConfig,
  ): void {
    const group = cdk.aws_iam.Group.fromGroupName(
      this,
      pascalCase(`${portfolioAssociationItem.name}-${portfolioItem.name}`),
      portfolioAssociationItem.name,
    ) as cdk.aws_iam.Group;
    if (!group) {
      throw new Error(`Group ${portfolioAssociationItem.name} not found in ${portfolioItem.account} account`);
    }
    // Associate Portfolio with an IAM group
    this.logger.info(
      `Associating Service Catalog portfolio ${portfolioItem.name} with IAM group ${portfolioAssociationItem.name}`,
    );
    portfolio.giveAccessToGroup(group);
  }

  private createPortfolioAssociationForRole(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
    portfolioAssociationItem: PortfolioAssociationConfig,
  ): void {
    const role = cdk.aws_iam.Role.fromRoleName(
      this,
      pascalCase(`${portfolioAssociationItem.name}-${portfolioItem.name}`),
      portfolioAssociationItem.name,
    ) as cdk.aws_iam.Role;
    if (!role) {
      throw new Error(`Role ${portfolioAssociationItem.name} not found in ${portfolioItem.account} account`);
    }
    // Associate Portfolio with an IAM Role
    this.logger.info(
      `Associating Service Catalog portfolio ${portfolioItem.name} with IAM role ${portfolioAssociationItem.name}`,
    );
    portfolio.giveAccessToRole(role);
  }

  private createPortfolioAssociationForUser(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
    portfolioAssociationItem: PortfolioAssociationConfig,
  ): void {
    const user = cdk.aws_iam.User.fromUserName(
      this,
      pascalCase(`${portfolioAssociationItem.name}-${portfolioItem.name}`),
      portfolioAssociationItem.name,
    ) as cdk.aws_iam.User;
    if (!user) {
      throw new Error(`User ${portfolioAssociationItem.name} not found in ${portfolioItem.account} account`);
    }
    // Associate Portfolio with an IAM User
    this.logger.info(
      `Associating Service Catalog portfolio ${portfolioItem.name} with IAM user ${portfolioAssociationItem.name}`,
    );
    portfolio.giveAccessToUser(user);
  }

  private createPortfolioAssociationForPermissionSet(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
    portfolioAssociationItem: PortfolioAssociationConfig,
  ): void {
    const roleArn = this.getPermissionSetRoleArn(portfolioAssociationItem.name, cdk.Stack.of(this).account);
    const role = cdk.aws_iam.Role.fromRoleArn(
      this,
      pascalCase(`${portfolioAssociationItem.name}-${portfolioItem.name}`),
      roleArn,
    ) as cdk.aws_iam.Role;
    if (!role) {
      throw new Error(
        `Role associated with Permission Set ${portfolioAssociationItem.name} not found in ${portfolioItem.account} account`,
      );
    }
    // Associate Portfolio with an IAM Role
    this.logger.info(
      `Associating Service Catalog portfolio ${portfolioItem.name} with IAM role linked to Permission Set ${portfolioAssociationItem.name}`,
    );
    portfolio.giveAccessToRole(role);
  }

  private getPermissionSetRoleArn(permissionSetName: string, accountId: string): string {
    this.logger.info(
      `Looking up IAM Role ARN associated with AWS Identity Center Permission Set ${permissionSetName} in account ${accountId}`,
    );
    const permissionSetRoleArn = new IdentityCenterGetPermissionRoleArn(
      this,
      pascalCase(`${permissionSetName}-${accountId}`),
      {
        permissionSetName: permissionSetName,
        accountId: accountId,
      },
    );
    return permissionSetRoleArn.roleArn;
  }
}
