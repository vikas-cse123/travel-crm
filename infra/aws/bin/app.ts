#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { config } from '../config.js';
import { ApiStack, type ApiStackProps } from '../lib/api-stack.js';
import { FrontendStack, type FrontendStackProps } from '../lib/frontend-stack.js';
import { AlbFrontendStack, type AlbFrontendStackProps } from '../lib/alb-frontend-stack.js';
import { CicdStack, type CicdStackProps } from '../lib/cicd-stack.js';
import {
  MarketingRegistryStack,
  type MarketingRegistryStackProps,
} from '../lib/marketing-registry-stack.js';
import {
  MarketingServiceStack,
  type MarketingServiceStackProps,
} from '../lib/marketing-service-stack.js';
import {
  YourQuotationStack,
  type YourQuotationStackProps,
} from '../lib/your-quotation-stack.js';

const app = new App();

const env = {
  account: config.account,
  region: config.region,
};

const api = new ApiStack(app, 'InterscaleApiStack', {
  env,
  config,
} as ApiStackProps);

// CloudFront-based frontend stack. Kept in the app for a future CloudFront
// migration but never deployed while CloudFront is blocked by account
// verification.
new FrontendStack(app, 'InterscaleFrontendStack', {
  env,
  config,
  albDnsName: api.albDnsName,
} as FrontendStackProps);

// No-CloudFront production frontend behind the existing ALB.
new AlbFrontendStack(app, 'InterscaleAlbFrontendStack', {
  env,
  config,
} as AlbFrontendStackProps);

// GitHub Actions OIDC provider + least-privilege production deployment role.
new CicdStack(app, 'InterscaleCicdStack', {
  env,
  config,
} as CicdStackProps);

// Public marketing website: ECR registry (deployed first so the image can be
// pushed before the service stack references it) and the Fargate service.
new MarketingRegistryStack(app, 'InterscaleMarketingRegistryStack', {
  env,
  config,
} as MarketingRegistryStackProps);

new MarketingServiceStack(app, 'InterscaleMarketingServiceStack', {
  env,
  config,
} as MarketingServiceStackProps);

new YourQuotationStack(app, 'InterscaleYourQuotationStack', {
  env,
  config,
} as YourQuotationStackProps);
