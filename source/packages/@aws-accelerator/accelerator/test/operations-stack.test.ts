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
import { SynthUtils } from '@aws-cdk/assert';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';

const testNamePrefix = 'Construct(OperationsStack): ';

/**
 * OperationsStack
 */
const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.OPERATIONS, 'all-enabled', 'aws');
const stack = acceleratorTestStacks.stacks.get(`Management-us-east-1`)!;

/**
 * OperationsStack construct test
 */
describe('OperationsStack', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of IAM group resource test
   */
  test(`${testNamePrefix} IAM group resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Group', 1);
  });

  /**
   * Number of IAM user resource test
   */
  test(`${testNamePrefix} IAM user resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::User', 2);
  });

  /**
   * Number of SecretsManager secret resource test
   */
  test(`${testNamePrefix} SecretsManager secret resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SecretsManager::Secret', 2);
  });

  /**
   * Number of IAM managedPolicy resource test
   */
  test(`${testNamePrefix} IAM managedPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::ManagedPolicy', 1);
  });

  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of IAM InstanceProfile resource test
   */
  test(`${testNamePrefix} IAM InstanceProfile resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::InstanceProfile', 1);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 2);
  });

  /**
   * IAM group Administrators resource configuration test
   */
  test(`${testNamePrefix} IAM group Administrators resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AdministratorsA37EF73A: {
          Type: 'AWS::IAM::Group',
          Properties: {
            GroupName: 'Administrators',
            ManagedPolicyArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AdministratorAccess',
                  ],
                ],
              },
            ],
          },
        },
      },
    });
  });

  /**
   * IAM user BreakGlassUser01 resource configuration test
   */
  test(`${testNamePrefix} IAM user BreakGlassUser01 resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser01AA051328: {
          Type: 'AWS::IAM::User',
          Properties: {
            Groups: [
              {
                Ref: 'AdministratorsA37EF73A',
              },
            ],
            LoginProfile: {
              Password: {
                'Fn::Join': [
                  '',
                  [
                    '{{resolve:secretsmanager:',
                    {
                      Ref: 'BreakGlassUser01Secret8A54324D',
                    },
                    ':SecretString:::}}',
                  ],
                ],
              },
            },
            PermissionsBoundary: {
              Ref: 'DefaultBoundaryPolicy489A8D26',
            },
            UserName: 'breakGlassUser01',
          },
        },
      },
    });
  });

  /**
   * SecretsManager secret BreakGlassUser01Secret resource configuration test
   */
  test(`${testNamePrefix} SecretsManager secret BreakGlassUser01Secret resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser01Secret8A54324D: {
          Type: 'AWS::SecretsManager::Secret',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            GenerateSecretString: {
              GenerateStringKey: 'password',
              SecretStringTemplate: '{"username":"breakGlassUser01"}',
            },
            Name: '/accelerator/breakGlassUser01',
          },
        },
      },
    });
  });

  /**
   * IAM user BreakGlassUser02 resource configuration test
   */
  test(`${testNamePrefix} IAM user BreakGlassUser02 resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser02DFF444C8: {
          Type: 'AWS::IAM::User',
          Properties: {
            Groups: [
              {
                Ref: 'AdministratorsA37EF73A',
              },
            ],
            LoginProfile: {
              Password: {
                'Fn::Join': [
                  '',
                  [
                    '{{resolve:secretsmanager:',
                    {
                      Ref: 'BreakGlassUser02Secret4D200D8D',
                    },
                    ':SecretString:::}}',
                  ],
                ],
              },
            },
            PermissionsBoundary: {
              Ref: 'DefaultBoundaryPolicy489A8D26',
            },
            UserName: 'breakGlassUser02',
          },
        },
      },
    });
  });

  /**
   * SecretsManager secret BreakGlassUser02Secret resource configuration test
   */
  test(`${testNamePrefix} SecretsManager secret BreakGlassUser02Secret resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser02Secret4D200D8D: {
          Type: 'AWS::SecretsManager::Secret',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            GenerateSecretString: {
              GenerateStringKey: 'password',
              SecretStringTemplate: '{"username":"breakGlassUser02"}',
            },
            Name: '/accelerator/breakGlassUser02',
          },
        },
      },
    });
  });

  /**
   * IAM managedPolicy DefaultBoundaryPolicy resource configuration test
   */
  test(`${testNamePrefix} IAM managedPolicy DefaultBoundaryPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DefaultBoundaryPolicy489A8D26: {
          Metadata: {
            cdk_nag: {
              rules_to_suppress: [
                {
                  id: 'AwsSolutions-IAM5',
                  reason: 'Policies definition are derived from accelerator iam-config boundary-policy file',
                },
              ],
            },
          },
          Properties: {
            Description: '',
            ManagedPolicyName: 'Default-Boundary-Policy',
            Path: '/',
            PolicyDocument: {
              Statement: [
                {
                  Action: '*',
                  Effect: 'Allow',
                  Resource: '*',
                },
                {
                  Condition: {
                    Bool: {
                      'aws:MultiFactorAuthPresent': 'false',
                      'aws:ViaAWSService': 'false',
                    },
                  },
                  Effect: 'Deny',
                  NotAction: [
                    'iam:CreateVirtualMFADevice',
                    'iam:DeleteVirtualMFADevice',
                    'iam:ListVirtualMFADevices',
                    'iam:EnableMFADevice',
                    'iam:ResyncMFADevice',
                    'iam:ListAccountAliases',
                    'iam:ListUsers',
                    'iam:ListSSHPublicKeys',
                    'iam:ListAccessKeys',
                    'iam:ListServiceSpecificCredentials',
                    'iam:ListMFADevices',
                    'iam:GetAccountSummary',
                    'sts:GetSessionToken',
                  ],
                  Resource: '*',
                },
              ],
              Version: '2012-10-17',
            },
          },
          Type: 'AWS::IAM::ManagedPolicy',
        },
      },
    });
  });

  /**
   * IAM role Ec2DefaultSsmAdRole resource configuration test
   */
  test(`${testNamePrefix} IAM role Ec2DefaultSsmAdRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Ec2DefaultSsmAdRoleADFFA4C6: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'ec2.amazonaws.com',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AmazonSSMManagedInstanceCore',
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AmazonSSMDirectoryServiceAccess',
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/CloudWatchAgentServerPolicy',
                  ],
                ],
              },
            ],
            PermissionsBoundary: {
              Ref: 'DefaultBoundaryPolicy489A8D26',
            },
            RoleName: 'EC2-Default-SSM-AD-Role',
          },
        },
      },
    });
  });

  /**
   * IAM InstanceProfile Ec2DefaultSsmAdRoleInstanceProfile resource configuration test
   */
  test(`${testNamePrefix} IAM InstanceProfile Ec2DefaultSsmAdRoleInstanceProfile resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Ec2DefaultSsmAdRoleInstanceProfile: {
          Type: 'AWS::IAM::InstanceProfile',
          Properties: {
            InstanceProfileName: {
              Ref: 'Ec2DefaultSsmAdRoleADFFA4C6',
            },
            Roles: [
              {
                Ref: 'Ec2DefaultSsmAdRoleADFFA4C6',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamStackId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-OperationsStack-111111111111-us-east-1/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
        },
      },
    });
  });
});
