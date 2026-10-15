export interface ColumnDefinition {
  id: string
  name: string
  format: string
  dataType: string
  isPrimaryKey: boolean
  isNullable: boolean
  isUnique?: boolean
  defaultValue?: string | null
  foreignKey?: {
    targetTable: string
    targetColumn: string
    targetSchema?: string
  }
  comment?: string
}

export interface TableDefinition {
  id: string
  schema: string
  name: string
  comment?: string
  estimatedRowCount: number
  columns: ColumnDefinition[]
  rows: Record<string, any>[]
  rlsEnabled?: boolean
  realtimeEnabled?: boolean
}

export interface SchemaDefinition {
  name: string
  tables: TableDefinition[]
}

export interface SqlFolder {
  id: string
  name: string
  visibility?: 'private' | 'shared'
}

export interface SqlSnippet {
  id: string
  name: string
  description?: string
  sql: string
  inserted_at: string
  updated_at: string
  isFavorite?: boolean
  folderId?: string | null
  visibility?: 'private' | 'shared'
}

export const MOCK_PROJECT = {
  id: 'prj_01h9yq2',
  name: 'production-db',
  ref: 'default-prod',
  status: 'ACTIVE_HEALTHY',
  organization: 'Acme Corp',
  region: 'us-east-1',
  regionName: 'North Virginia',
  inserted_at: '2025-01-15T08:00:00Z',
  postgresVersion: 'PostgreSQL 15.6',
  diskSize: '42.8 MB',
  diskLimit: '8 GB',
  activeConnections: 14,
  maxConnections: 60,
  cpuUsage: '8.4%',
  memoryUsage: '382 MB / 1 GB',
  totalRequests: 1842930,
  connectionInfo: {
    host: 'db.default-prod.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    poolerHost: 'aws-0-us-east-1.pooler.supabase.co',
    poolerPort: 6543,
  },
}

export const MOCK_TABLES: TableDefinition[] = [
  {
    id: 'tbl_users',
    schema: 'public',
    name: 'users',
    comment: 'Application users registered through Auth and OAuth providers',
    estimatedRowCount: 1248,
    rlsEnabled: true,
    realtimeEnabled: true,
    columns: [
      { id: 'c1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
      { id: 'c2', name: 'email', format: 'text', dataType: 'varchar(255)', isPrimaryKey: false, isNullable: false, isUnique: true },
      { id: 'c3', name: 'full_name', format: 'text', dataType: 'varchar(120)', isPrimaryKey: false, isNullable: true },
      { id: 'c4', name: 'role', format: 'text', dataType: 'varchar(50)', isPrimaryKey: false, isNullable: false, defaultValue: "'user'" },
      { id: 'c5', name: 'avatar_url', format: 'text', dataType: 'text', isPrimaryKey: false, isNullable: true },
      { id: 'c6', name: 'is_active', format: 'boolean', dataType: 'boolean', isPrimaryKey: false, isNullable: false, defaultValue: 'true' },
      { id: 'c7', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false, defaultValue: 'now()' },
      { id: 'c8', name: 'last_sign_in', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: true },
    ],
    rows: [
      { id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', email: 'sophia.chen@acme.io', full_name: 'Sophia Chen', role: 'admin', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120', is_active: true, created_at: '2025-01-18 10:14:22+00', last_sign_in: '2025-03-29 14:20:11+00' },
      { id: 'b3f572a1-6381-42e5-bc09-d754e197d210', email: 'alex.morgan@venture.co', full_name: 'Alex Morgan', role: 'member', avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120', is_active: true, created_at: '2025-01-20 12:45:00+00', last_sign_in: '2025-03-30 09:12:44+00' },
      { id: 'c4217ef8-8219-4a92-bd83-f321948512bb', email: 'marcus.vance@techcorp.com', full_name: 'Marcus Vance', role: 'developer', avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120', is_active: true, created_at: '2025-01-22 18:22:15+00', last_sign_in: '2025-03-28 16:50:33+00' },
      { id: 'd982103a-0e92-4912-9c12-7481290312aa', email: 'elena.rostova@cloudscale.net', full_name: 'Elena Rostova', role: 'manager', avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120', is_active: true, created_at: '2025-01-25 08:30:19+00', last_sign_in: '2025-03-29 20:11:05+00' },
      { id: 'e1029384-5f12-4819-a921-129847192837', email: 'david.kim@hypergrowth.dev', full_name: 'David Kim', role: 'developer', avatar_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120', is_active: true, created_at: '2025-02-01 11:05:40+00', last_sign_in: '2025-03-30 08:42:19+00' },
      { id: 'f8392019-3e91-4920-b819-847291039281', email: 'sarah.jenkins@designlab.design', full_name: 'Sarah Jenkins', role: 'designer', avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120', is_active: false, created_at: '2025-02-04 14:19:22+00', last_sign_in: '2025-02-28 11:15:00+00' },
      { id: 'a9182374-1298-4821-9831-298374619283', email: 'tariq.almansoor@fintech.io', full_name: 'Tariq Al-Mansoor', role: 'admin', avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120', is_active: true, created_at: '2025-02-10 19:40:11+00', last_sign_in: '2025-03-29 22:04:19+00' },
      { id: 'b2837461-9182-4736-8192-384756192837', email: 'chloe.dubois@paris-media.fr', full_name: 'Chloé Dubois', role: 'member', avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120', is_active: true, created_at: '2025-02-14 09:18:45+00', last_sign_in: '2025-03-30 07:11:50+00' },
      { id: 'c3746192-8192-4918-a829-475619283746', email: 'liam.o_connor@dublin-iot.ie', full_name: "Liam O'Connor", role: 'developer', avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120', is_active: true, created_at: '2025-02-20 15:33:02+00', last_sign_in: '2025-03-27 13:40:12+00' },
      { id: 'd4857291-0192-4827-b918-583746192837', email: 'priya.sharma@bangalore-ai.in', full_name: 'Priya Sharma', role: 'data_engineer', avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120', is_active: true, created_at: '2025-02-25 17:02:19+00', last_sign_in: '2025-03-29 18:22:45+00' },
    ],
  },
  {
    id: 'tbl_organizations',
    schema: 'public',
    name: 'organizations',
    comment: 'Customer tenant accounts and subscription plans',
    estimatedRowCount: 48,
    rlsEnabled: true,
    realtimeEnabled: false,
    columns: [
      { id: 'o1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
      { id: 'o2', name: 'name', format: 'text', dataType: 'varchar(100)', isPrimaryKey: false, isNullable: false },
      { id: 'o3', name: 'slug', format: 'text', dataType: 'varchar(64)', isPrimaryKey: false, isNullable: false, isUnique: true },
      { id: 'o4', name: 'plan', format: 'text', dataType: 'varchar(32)', isPrimaryKey: false, isNullable: false, defaultValue: "'pro'" },
      { id: 'o5', name: 'billing_email', format: 'text', dataType: 'varchar(255)', isPrimaryKey: false, isNullable: false },
      { id: 'o6', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false, defaultValue: 'now()' },
    ],
    rows: [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Acme Corporation', slug: 'acme-corp', plan: 'enterprise', billing_email: 'billing@acme.io', created_at: '2025-01-15 08:00:00+00' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Venture Labs', slug: 'venture-labs', plan: 'team', billing_email: 'finance@venture.co', created_at: '2025-01-19 11:20:00+00' },
      { id: '33333333-3333-3333-3333-333333333333', name: 'CloudScale Networks', slug: 'cloudscale', plan: 'pro', billing_email: 'accounts@cloudscale.net', created_at: '2025-01-24 14:35:10+00' },
      { id: '44444444-4444-4444-4444-444444444444', name: 'HyperGrowth Systems', slug: 'hypergrowth', plan: 'pro', billing_email: 'ops@hypergrowth.dev', created_at: '2025-01-31 16:40:00+00' },
    ],
  },
  {
    id: 'tbl_organization_members',
    schema: 'public',
    name: 'organization_members',
    comment: 'Maps users to their respective organizations with scoped privileges',
    estimatedRowCount: 142,
    rlsEnabled: true,
    realtimeEnabled: false,
    columns: [
      { id: 'om1', name: 'organization_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, foreignKey: { targetTable: 'organizations', targetColumn: 'id' } },
      { id: 'om2', name: 'user_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, foreignKey: { targetTable: 'users', targetColumn: 'id' } },
      { id: 'om3', name: 'role', format: 'text', dataType: 'varchar(32)', isPrimaryKey: false, isNullable: false, defaultValue: "'member'" },
      { id: 'om4', name: 'joined_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false, defaultValue: 'now()' },
    ],
    rows: [
      { organization_id: '11111111-1111-1111-1111-111111111111', user_id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', role: 'owner', joined_at: '2025-01-18 10:15:00+00' },
      { organization_id: '11111111-1111-1111-1111-111111111111', user_id: 'c4217ef8-8219-4a92-bd83-f321948512bb', role: 'admin', joined_at: '2025-01-22 18:30:00+00' },
      { organization_id: '22222222-2222-2222-2222-222222222222', user_id: 'b3f572a1-6381-42e5-bc09-d754e197d210', role: 'owner', joined_at: '2025-01-20 12:50:00+00' },
      { organization_id: '33333333-3333-3333-3333-333333333333', user_id: 'd982103a-0e92-4912-9c12-7481290312aa', role: 'owner', joined_at: '2025-01-25 08:35:00+00' },
      { organization_id: '44444444-4444-4444-4444-444444444444', user_id: 'e1029384-5f12-4819-a921-129847192837', role: 'owner', joined_at: '2025-02-01 11:10:00+00' },
    ],
  },
  {
    id: 'tbl_posts',
    schema: 'public',
    name: 'posts',
    comment: 'Published and draft articles and documentation',
    estimatedRowCount: 310,
    rlsEnabled: true,
    realtimeEnabled: true,
    columns: [
      { id: 'p1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
      { id: 'p2', name: 'author_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: false, isNullable: false, foreignKey: { targetTable: 'users', targetColumn: 'id' } },
      { id: 'p3', name: 'title', format: 'text', dataType: 'varchar(200)', isPrimaryKey: false, isNullable: false },
      { id: 'p4', name: 'slug', format: 'text', dataType: 'varchar(220)', isPrimaryKey: false, isNullable: false, isUnique: true },
      { id: 'p5', name: 'status', format: 'text', dataType: 'varchar(20)', isPrimaryKey: false, isNullable: false, defaultValue: "'draft'" },
      { id: 'p6', name: 'view_count', format: 'integer', dataType: 'integer', isPrimaryKey: false, isNullable: false, defaultValue: '0' },
      { id: 'p7', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false, defaultValue: 'now()' },
    ],
    rows: [
      { id: '55555555-5555-5555-5555-555555555551', author_id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', title: 'Architecting Resilient Realtime Backends with Postgres', slug: 'architecting-resilient-realtime-postgres', status: 'published', view_count: 14209, created_at: '2025-02-01 14:00:00+00' },
      { id: '55555555-5555-5555-5555-555555555552', author_id: 'c4217ef8-8219-4a92-bd83-f321948512bb', title: 'Postgres Row Level Security: A Complete Practical Guide', slug: 'postgres-rls-complete-practical-guide', status: 'published', view_count: 38910, created_at: '2025-02-08 16:30:00+00' },
      { id: '55555555-5555-5555-5555-555555555553', author_id: 'e1029384-5f12-4819-a921-129847192837', title: 'Optimizing B-Tree and GIN Indexes on High Write Tables', slug: 'optimizing-indexes-high-write-workloads', status: 'published', view_count: 8940, created_at: '2025-02-15 10:15:00+00' },
      { id: '55555555-5555-5555-5555-555555555554', author_id: 'd982103a-0e92-4912-9c12-7481290312aa', title: 'Zero Downtime Migrations: The Safe Way to Evolve Schemas', slug: 'zero-downtime-postgres-migrations', status: 'draft', view_count: 0, created_at: '2025-03-01 18:20:00+00' },
    ],
  },
  {
    id: 'tbl_comments',
    schema: 'public',
    name: 'comments',
    comment: 'Reader comments and discussions on articles',
    estimatedRowCount: 980,
    rlsEnabled: true,
    realtimeEnabled: true,
    columns: [
      { id: 'cm1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
      { id: 'cm2', name: 'post_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: false, isNullable: false, foreignKey: { targetTable: 'posts', targetColumn: 'id' } },
      { id: 'cm3', name: 'user_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: false, isNullable: false, foreignKey: { targetTable: 'users', targetColumn: 'id' } },
      { id: 'cm4', name: 'content', format: 'text', dataType: 'text', isPrimaryKey: false, isNullable: false },
      { id: 'cm5', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false, defaultValue: 'now()' },
    ],
    rows: [
      { id: '77777777-7777-7777-7777-777777777771', post_id: '55555555-5555-5555-5555-555555555551', user_id: 'b3f572a1-6381-42e5-bc09-d754e197d210', content: 'Incredible breakdown of logical replication stream filtering!', created_at: '2025-02-02 09:12:00+00' },
      { id: '77777777-7777-7777-7777-777777777772', post_id: '55555555-5555-5555-5555-555555555552', user_id: 'd982103a-0e92-4912-9c12-7481290312aa', content: 'The security definer vs security invoker nuances are explained so clearly here.', created_at: '2025-02-09 11:45:00+00' },
      { id: '77777777-7777-7777-7777-777777777773', post_id: '55555555-5555-5555-5555-555555555553', user_id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', content: 'Did you benchmark partial indexes for the soft-deleted rows pattern?', created_at: '2025-02-16 14:10:00+00' },
    ],
  },
  {
    id: 'tbl_api_keys',
    schema: 'public',
    name: 'api_keys',
    comment: 'Client tokens and secret hashes for programmatic API access',
    estimatedRowCount: 76,
    rlsEnabled: true,
    realtimeEnabled: false,
    columns: [
      { id: 'k1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
      { id: 'k2', name: 'user_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: false, isNullable: false, foreignKey: { targetTable: 'users', targetColumn: 'id' } },
      { id: 'k3', name: 'name', format: 'text', dataType: 'varchar(100)', isPrimaryKey: false, isNullable: false },
      { id: 'k4', name: 'key_prefix', format: 'text', dataType: 'varchar(16)', isPrimaryKey: false, isNullable: false },
      { id: 'k5', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false, defaultValue: 'now()' },
      { id: 'k6', name: 'expires_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: true },
    ],
    rows: [
      { id: '99999999-9999-9999-9999-999999999991', user_id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', name: 'CI/CD Deployment Token', key_prefix: 'sb_live_8a9c', created_at: '2025-01-20 09:00:00+00', expires_at: '2026-01-20 09:00:00+00' },
      { id: '99999999-9999-9999-9999-999999999992', user_id: 'c4217ef8-8219-4a92-bd83-f321948512bb', name: 'Staging Integration Bot', key_prefix: 'sb_test_c421', created_at: '2025-02-05 14:20:00+00', expires_at: null },
    ],
  },
]

export const MOCK_AUTH_TABLES: TableDefinition[] = [
  {
    id: 'tbl_auth_users',
    schema: 'auth',
    name: 'users',
    comment: 'Internal auth users with password hashes and metadata',
    estimatedRowCount: 1248,
    columns: [
      { id: 'au1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false },
      { id: 'au2', name: 'email', format: 'text', dataType: 'varchar(255)', isPrimaryKey: false, isNullable: true },
      { id: 'au3', name: 'encrypted_password', format: 'text', dataType: 'varchar(255)', isPrimaryKey: false, isNullable: true },
      { id: 'au4', name: 'email_confirmed_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: true },
      { id: 'au5', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false },
    ],
    rows: [
      { id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', email: 'sophia.chen@acme.io', encrypted_password: '$2a$10$e7WqJ8z471b0zZ29...', email_confirmed_at: '2025-01-18 10:14:30+00', created_at: '2025-01-18 10:14:22+00' },
      { id: 'b3f572a1-6381-42e5-bc09-d754e197d210', email: 'alex.morgan@venture.co', encrypted_password: '$2a$10$k1948fha0192h...', email_confirmed_at: '2025-01-20 12:45:15+00', created_at: '2025-01-20 12:45:00+00' },
    ],
  },
  {
    id: 'tbl_auth_sessions',
    schema: 'auth',
    name: 'sessions',
    comment: 'Active refresh tokens and web sessions',
    estimatedRowCount: 412,
    columns: [
      { id: 'as1', name: 'id', format: 'uuid', dataType: 'uuid', isPrimaryKey: true, isNullable: false },
      { id: 'as2', name: 'user_id', format: 'uuid', dataType: 'uuid', isPrimaryKey: false, isNullable: false, foreignKey: { targetTable: 'users', targetColumn: 'id', targetSchema: 'auth' } },
      { id: 'as3', name: 'created_at', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: false },
      { id: 'as4', name: 'not_after', format: 'timestamptz', dataType: 'timestamptz', isPrimaryKey: false, isNullable: true },
    ],
    rows: [
      { id: 'sess_1', user_id: '8a9c27b0-4f51-4e78-9a2d-11424681a901', created_at: '2025-03-29 14:20:11+00', not_after: '2025-04-29 14:20:11+00' },
      { id: 'sess_2', user_id: 'b3f572a1-6381-42e5-bc09-d754e197d210', created_at: '2025-03-30 09:12:44+00', not_after: '2025-04-30 09:12:44+00' },
    ],
  },
]

export const MOCK_SCHEMAS: SchemaDefinition[] = [
  { name: 'public', tables: MOCK_TABLES },
  { name: 'auth', tables: MOCK_AUTH_TABLES },
]

export const MOCK_SQL_SNIPPETS: SqlSnippet[] = [
  {
    id: 'snip_1',
    name: 'Top 10 Active Users by Posts and Comments',
    description: 'Finds the most engaged users with aggregated counts across posts and comments',
    isFavorite: true,
    sql: `-- Top engaged users in the platform
SELECT 
    u.id,
    u.full_name,
    u.email,
    u.role,
    COUNT(DISTINCT p.id) AS total_posts,
    COUNT(DISTINCT c.id) AS total_comments,
    COALESCE(SUM(p.view_count), 0) AS total_post_views
FROM public.users u
LEFT JOIN public.posts p ON p.author_id = u.id
LEFT JOIN public.comments c ON c.user_id = u.id
GROUP BY u.id, u.full_name, u.email, u.role
ORDER BY total_post_views DESC, total_posts DESC
LIMIT 10;`,
    inserted_at: '2025-02-10T14:22:00Z',
    updated_at: '2025-03-28T09:15:00Z',
  },
  {
    id: 'snip_2',
    name: 'Table Disk Sizes & Approximate Row Counts',
    description: 'Diagnoses largest tables and their associated index storage consumption',
    isFavorite: true,
    sql: `-- Inspect physical storage footprint per table
SELECT 
    schemaname AS schema,
    relname AS table_name,
    n_live_tup AS estimated_rows,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;`,
    inserted_at: '2025-02-14T11:00:00Z',
    updated_at: '2025-03-25T16:30:00Z',
  },
  {
    id: 'snip_3',
    name: 'Recent Organizations & Members Overview',
    description: 'Lists all organizations with their subscription tier and owner details',
    isFavorite: false,
    sql: `SELECT 
    o.id AS org_id,
    o.name AS org_name,
    o.plan,
    o.billing_email,
    u.full_name AS owner_name,
    u.email AS owner_email,
    o.created_at
FROM public.organizations o
JOIN public.organization_members om ON om.organization_id = o.id AND om.role = 'owner'
JOIN public.users u ON u.id = om.user_id
ORDER BY o.created_at DESC;`,
    inserted_at: '2025-02-20T10:11:00Z',
    updated_at: '2025-03-12T14:10:00Z',
  },
  {
    id: 'snip_4',
    name: 'Unindexed Foreign Keys Diagnostic',
    description: 'Finds foreign key columns that lack a supporting index for fast joins',
    isFavorite: false,
    sql: `-- Unindexed Foreign Keys in public schema
SELECT 
    c.conrelid::regclass AS "table",
    string_agg(a.attname, ', ' ORDER BY x.n) AS fk_columns,
    c.confrelid::regclass AS referenced_table
FROM pg_constraint c
CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, n)
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum
WHERE c.contype = 'f' 
  AND c.connamespace = 'public'::regnamespace
GROUP BY c.conrelid, c.confrelid, c.conname
LIMIT 20;`,
    inserted_at: '2025-03-01T15:40:00Z',
    updated_at: '2025-03-20T12:00:00Z',
  },
]

export const MOCK_USAGE_TIMESERIES = [
  { timestamp: '00:00', ok_count: 1240, warning_count: 12, error_count: 1 },
  { timestamp: '02:00', ok_count: 850, warning_count: 5, error_count: 0 },
  { timestamp: '04:00', ok_count: 620, warning_count: 3, error_count: 0 },
  { timestamp: '06:00', ok_count: 1450, warning_count: 18, error_count: 2 },
  { timestamp: '08:00', ok_count: 3820, warning_count: 42, error_count: 5 },
  { timestamp: '10:00', ok_count: 5410, warning_count: 65, error_count: 8 },
  { timestamp: '12:00', ok_count: 6100, warning_count: 58, error_count: 4 },
  { timestamp: '14:00', ok_count: 5890, warning_count: 49, error_count: 3 },
  { timestamp: '16:00', ok_count: 4920, warning_count: 38, error_count: 6 },
  { timestamp: '18:00', ok_count: 4100, warning_count: 29, error_count: 2 },
  { timestamp: '20:00', ok_count: 2950, warning_count: 15, error_count: 1 },
  { timestamp: '22:00', ok_count: 1890, warning_count: 8, error_count: 0 },
]
