import { registerAs } from '@nestjs/config';
import { loadProperties } from './properties-loader';

export default registerAs('server', () => loadProperties().server);
