export type SslMode = 'prefer' | 'require' | 'verify-ca' | 'verify-full';

export type DatabaseSettings = {
  server: string;
  port: number;
  database: string;
  username: string;
  sslMode: SslMode;
  password: string;
};

export type DatabaseSettingsPublic = Omit<DatabaseSettings, 'password'> & {
  passwordConfigured: boolean;
};

export type ConnectionStatus =
  | 'success'
  | 'serverUnreachable'
  | 'timeout'
  | 'authenticationFailed'
  | 'databaseMissing'
  | 'tlsError'
  | 'configurationIncomplete'
  | 'postgresError';

export type ConnectionTestResult = {
  success: boolean;
  status: ConnectionStatus;
  message: string;
};

export type DatabaseFormStatus =
  | 'notConfigured'
  | 'checking'
  | 'success'
  | 'failed'
  | 'saved';

export const emptyDatabaseSettings: DatabaseSettings = {
  server: '',
  port: 5432,
  database: '',
  username: '',
  sslMode: 'prefer',
  password: '',
};

export function toEditableSettings(settings: DatabaseSettingsPublic): DatabaseSettings {
  return {
    server: settings.server,
    port: settings.port || 5432,
    database: settings.database,
    username: settings.username,
    sslMode: settings.sslMode,
    password: '',
  };
}

export function passwordHelpText(passwordConfigured: boolean): string {
  return passwordConfigured ? 'Password configurata. Lascia vuoto per mantenerla.' : '';
}

export function databaseButtonsDisabled(status: DatabaseFormStatus, isDesktop: boolean) {
  const checking = status === 'checking';
  return {
    testDisabled: !isDesktop || checking,
    saveDisabled: !isDesktop || checking,
  };
}
