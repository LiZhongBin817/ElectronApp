import { setupAppIdentity } from './appIdentity';

setupAppIdentity();

const { App } = require('./app') as typeof import('./app');
const app = new App();

void app;
