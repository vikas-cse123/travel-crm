#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { config } from '../config.js';
import { YourQuotationStack, type YourQuotationStackProps } from '../lib/your-quotation-stack.js';

const app = new App();

const env = {
  account: config.account,
  region: config.region,
};

new YourQuotationStack(app, 'InterscaleYourQuotationStack', {
  env,
  config,
} as YourQuotationStackProps);
