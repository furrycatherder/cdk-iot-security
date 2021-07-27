const { AwsCdkConstructLibrary, NpmAccess, DependenciesUpgradeMechanism, AUTOMATION_TOKEN } = require('projen');
const project = new AwsCdkConstructLibrary({
  author: 'SoftChef',
  authorAddress: 'yehtarnsu@softchef.com',
  cdkVersion: '1.95.2',
  defaultReleaseBranch: 'main',
  name: '@softchef/cdk-iot-security',
  npmAccess: NpmAccess.PUBLIC,
  repositoryUrl: 'https://yehtarnsu@github.com/SoftChef/cdk-iot-security.git',
  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/aws-lambda-nodejs',
    '@aws-cdk/aws-lambda',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-apigateway',
    '@aws-cdk/aws-iot',
    '@aws-cdk/aws-dynamodb',
    '@aws-cdk/aws-sqs',
    '@aws-cdk/aws-lambda-event-sources',
    '@aws-cdk/aws-s3',
  ],
  bundledDeps: [
    'joi',
    'node-forge',
    '@types/node-forge',
    '@types/node@15.12.4',
    '@aws-sdk/client-iot',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-lambda',
    '@softchef/lambda-events',
    'mqtt',
    '@types/ws',
    '@types/uuid',
    'uuid',
  ],
  devDeps: [
    'aws-sdk-client-mock',
    '@softchef/iot-just-in-time-registration',
    'aws-iot-device-sdk',
    'esbuild',
  ],
  depsUpgrade: DependenciesUpgradeMechanism.githubWorkflow({
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      secret: AUTOMATION_TOKEN,
    },
  }),
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['MinCheTsai'],
  },
  tsconfig: {
    compilerOptions: {
      target: 'ES6',
      lib: [
        'DOM',
        'ES2020',
      ],
      esModuleInterop: true,
    },
  },
  keywords: [
    'aws',
    'cdk',
    'construct',
    'JITR',
    'JITP',
    'Fleet-Provisioning',
  ],
});
project.synth();