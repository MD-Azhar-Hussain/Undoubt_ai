function databaseErrorMessage(error) {
  if (error.code === 'DB_CONFIG') return error.message;
  const messages = {
    '28P01': 'Database password was rejected. Check the password in SUPABASE_DB_URL and URL-encode special characters.',
    '28000': 'Database authentication was rejected. Copy the complete PostgreSQL connection URI from Supabase Connect.',
    '42501': 'The database user lacks permission to install the schema. Use the project database owner connection for migration.',
    ENOTFOUND: 'Database hostname could not be resolved. Check the connection URI and network connection.',
    ECONNREFUSED: 'Database connection was refused. Check the hostname, port and project availability.',
    ENETUNREACH: 'Database network is unreachable. If the direct connection needs IPv6, try the Supabase Session pooler.',
    ETIMEDOUT: 'Database connection timed out. Check network access and project availability.',
    SELF_SIGNED_CERT_IN_CHAIN: 'TLS certificate could not be trusted. Set SUPABASE_DB_CA_FILE to the downloaded Supabase CA certificate.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate could not be verified. Configure the correct Supabase CA certificate.',
    CERT_HAS_EXPIRED: 'A TLS certificate has expired. Check the system clock and Supabase certificate.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'The TLS certificate does not match the database hostname. Copy the exact hostname from Supabase Connect.',
  };
  return messages[error.code] || 'Database operation failed. Check the connection URI, network, TLS certificate and database permissions. Credentials have not been printed.';
}
module.exports = { databaseErrorMessage };
