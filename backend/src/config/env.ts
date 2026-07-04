import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  ORACLE_PRIVATE_KEY: z.string().min(1),
  MONAD_RPC_URL: z.string().url().default('https://testnet-rpc.monad.xyz'),
  REGISTRY_CONTRACT_ADDRESS: z.string().min(1),
  BOUNTYGATE_CONTRACT_ADDRESS: z.string().optional().default(''),
  API_KEYS: z.string().default('dev-key-123').transform((s) => s.split(',').map((k) => k.trim())),
  GITHUB_TOKEN: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
}
