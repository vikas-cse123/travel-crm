import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { type DeployConfig } from '../config.js';

export interface CicdStackProps extends StackProps {
  config: DeployConfig;
}

/**
 * GitHub Actions OIDC infrastructure for production application deployment.
 *
 * Creates the GitHub OIDC identity provider (absent today; CFN looks up the
 * thumbprint automatically) and one least-privilege deployment role restricted
 * to the exact repository and production branch/environment. It manages ONLY
 * the OIDC provider and IAM role — never the application infrastructure, which
 * stays manual.
 */
export class CicdStack extends Stack {
  readonly deploymentRoleArn: string;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);
    const { config } = props;

    if (!config.githubOwner || !config.githubRepo) {
      throw new Error('CicdStack requires GITHUB_OWNER and GITHUB_REPO.');
    }

    // ------------------------------------------------- GitHub OIDC provider
    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // ------------------------------------------------- Deployment role
    const role = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'interscale-travel-crm-github-production',
      assumedBy: new iam.OpenIdConnectPrincipal(provider).withConditions({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          // GitHub includes the owner/repo numeric IDs in the `sub` claim
          // (e.g. repo:vikas-cse123@123/travel-crm@456:environment:production),
          // so match the exact owner/repo names with wildcards over the IDs.
          'token.actions.githubusercontent.com:sub': [
            `repo:${config.githubOwner}@*/${config.githubRepo}@*:environment:production`,
            `repo:${config.githubOwner}@*/${config.githubRepo}@*:ref:refs/heads/main`,
          ],
        },
      }),
      description:
        'Least-privilege GitHub Actions production deployment role for Interscale Travel CRM',
    });

    role.attachInlinePolicy(
      new iam.Policy(this, 'EcrDeployPolicy', {
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ecr:GetAuthorizationToken'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
                'ecr:InitiateLayerUpload',
                'ecr:UploadLayerPart',
                'ecr:CompleteLayerUpload',
                'ecr:PutImage',
                'ecr:DescribeImages',
                'ecr:DescribeRepositories',
              ],
              resources: [config.ecrApiRepoArn, config.frontendRepoArn, config.marketingRepoArn],
            }),
          ],
        }),
      }),
    );

    role.attachInlinePolicy(
      new iam.Policy(this, 'EcsDeployPolicy', {
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ecs:DescribeClusters'],
              resources: [config.ecsClusterArn],
            }),
            new iam.PolicyStatement({
              actions: ['ecs:DescribeServices', 'ecs:UpdateService'],
              resources: [
                config.ecsApiServiceArn,
                config.ecsFrontendServiceArn,
                config.ecsMarketingServiceArn,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'ecs:DescribeTaskDefinition',
                'ecs:RegisterTaskDefinition',
                'ecs:DescribeTasks',
                'ecs:ListTasks',
                'ecs:ListTaskDefinitions',
                'ecs:ListTaskDefinitionFamilies',
                'ecs:RunTask',
              ],
              resources: ['*'],
            }),
          ],
        }),
      }),
    );

    role.attachInlinePolicy(
      new iam.Policy(this, 'PassRolePolicy', {
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['iam:PassRole'],
              resources: [
                config.apiExecRoleArn,
                config.apiTaskRoleArn,
                config.frontendExecRoleArn,
                config.frontendTaskRoleArn,
                config.marketingExecRoleArn,
                config.marketingTaskRoleArn,
              ],
              conditions: {
                StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' },
              },
            }),
          ],
        }),
      }),
    );

    role.attachInlinePolicy(
      new iam.Policy(this, 'DeploymentObservabilityPolicy', {
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'elasticloadbalancing:DescribeTargetHealth',
                'elasticloadbalancing:DescribeTargetGroups',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                'ec2:DescribeSubnets',
                'ec2:DescribeSecurityGroups',
                'ec2:DescribeNetworkInterfaces',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: ['logs:DescribeLogStreams', 'logs:GetLogEvents'],
              resources: [
                config.apiLogGroupArn,
                config.frontendLogGroupArn,
                config.migrationLogGroupArn,
                config.marketingLogGroupArn,
              ],
            }),
          ],
        }),
      }),
    );

    this.deploymentRoleArn = role.roleArn;

    new CfnOutput(this, 'GitHubDeployRoleArn', { value: role.roleArn });
    new CfnOutput(this, 'GitHubOidcProviderArn', { value: provider.openIdConnectProviderArn });
  }
}
