import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { type DeployConfig } from '../config.js';

export interface MarketingRegistryStackProps extends StackProps {
  config: DeployConfig;
}

/**
 * ECR registry for the public marketing website container image.
 *
 * Kept as a separate stack from the service stack so the image can be built
 * and pushed before the ECS service (which references an immutable image tag)
 * is created. Repository is private by default and never publicly accessible.
 */
export class MarketingRegistryStack extends Stack {
  readonly repositoryArn: string;
  readonly repositoryUri: string;

  constructor(scope: Construct, id: string, props: MarketingRegistryStackProps) {
    super(scope, id, props);
    const { config } = props;

    const repo = new ecr.Repository(this, 'MarketingRepo', {
      repositoryName: config.marketingRepoName,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [{ maxImageCount: 10, tagStatus: ecr.TagStatus.ANY }],
    });

    this.repositoryArn = repo.repositoryArn;
    this.repositoryUri = repo.repositoryUri;

    new CfnOutput(this, 'MarketingRepositoryArn', { value: repo.repositoryArn });
    new CfnOutput(this, 'MarketingRepositoryUri', { value: repo.repositoryUri });
  }
}
