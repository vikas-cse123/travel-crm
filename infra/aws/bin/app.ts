#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { config } from '../config.js';
import { ApiStack, ApiStackProps } from '../lib/api-stack.js';
import { FrontendStack, FrontendStackProps } from '../lib/frontend-stack.js';
import { AlbFrontendStack, AlbFrontendStackProps } from '../lib/alb-frontend-stack.js';
import { CicdStack, CicdStackProps } from '../lib/cicd-stack.js';

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
