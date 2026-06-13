import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

let envLoaded = false;

function getEnv(key: string): string | undefined {
  const cozeKey = `COZE_` + key;
  if (process.env[cozeKey]) return process.env[cozeKey];
  if (process.env[key]) return process.env[key];
  return undefined;
}

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

function loadEnv(): void {
  if (envLoaded || (getEnv('SUPABASE_URL') && getEnv('SUPABASE_ANON_KEY'))) {
    return;
  }

  try {
    try {
      require('dotenv').config();
      if (getEnv('SUPABASE_URL') && getEnv('SUPABASE_ANON_KEY')) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    try {
      const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

      const output = execSync(`python3 -c '` + pythonCode.replace(/'/g, `'"'"'`) + `'`, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
          const key = line.substring(0, eqIndex);
          let value = line.substring(eqIndex + 1);
          if ((value.startsWith("'") && value.endsWith("'")) ||
              (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    } catch {
      // coze_workload_identity not available (local deployment)
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

function getSupabaseCredentials(): SupabaseCredentials {
  loadEnv();

  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');

  if (!url) {
    throw new Error('SUPABASE_URL is not set. Please check your .env file.');
  }
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is not set. Please check your .env file.');
  }

  return { url, anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnv();
  return getEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  let key: string;
  if (token) {
    key = anonKey;
  } else {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    key = serviceRoleKey ?? anonKey;
  }

  const globalOptions: Record<string, any> = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ` + token };
  }

  // Coze SDK - only attempt to use if configured (non-Vercel environments)
  if (process.env.COZE_INTEGRATION_BASE_URL && process.env.COZE_WORKLOAD_IDENTITY_API_KEY) {
    try {
      const { getReportBuffer, createWrappedFetch } = require('coze-coding-dev-sdk');
      const buffer = getReportBuffer();
      if (buffer) {
        globalOptions.fetch = createWrappedFetch(buffer, 'supabase');
      }
    } catch {
      // coze-coding-dev-sdk not available or misconfigured
    }
  }

  return createClient(url, key, {
    global: globalOptions,
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export { loadEnv, getSupabaseCredentials, getSupabaseServiceRoleKey, getSupabaseClient };
