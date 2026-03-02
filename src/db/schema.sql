-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE,
    api_token_hash VARCHAR(255) NOT NULL,
    enc_key_salt VARCHAR(255) NOT NULL,
    queue_schedule TEXT,
    queue_schedule_time TEXT,
    timezone TEXT DEFAULT 'UTC',
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    access_tier TEXT DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
    token VARCHAR(255) PRIMARY KEY,
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    used_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    canonical_url TEXT,
    url_hash VARCHAR(64) UNIQUE,
    domain VARCHAR(255),
    title TEXT,
    author TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    estimated_read_mins INTEGER,
    tags TEXT[],
    source_surface TEXT,
    scrape_status TEXT DEFAULT 'pending',
    content_enc TEXT NOT NULL,
    summary_enc TEXT NOT NULL,
    review_status TEXT DEFAULT 'pending',
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Chunks table with embedding vector column
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES items(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    chunk_index INTEGER NOT NULL,
    content_enc TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review sessions table
CREATE TABLE IF NOT EXISTS review_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    item_count INTEGER DEFAULT 0,
    items_done INTEGER DEFAULT 0,
    items_skipped INTEGER DEFAULT 0,
    items_removed INTEGER DEFAULT 0,
    nudge_sent BOOLEAN DEFAULT FALSE
);

-- Credentials table
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    platform TEXT NOT NULL,
    session_cookie_enc TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS items_user_id_review_status_idx ON items(user_id, review_status);
CREATE INDEX IF NOT EXISTS items_user_id_created_at_idx ON items(user_id, created_at);
CREATE INDEX IF NOT EXISTS chunks_user_id_idx ON chunks(user_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);

-- Add comments for documentation
COMMENT ON TABLE users IS 'CIB user accounts';
COMMENT ON TABLE invites IS 'Invite tokens for user registration';
COMMENT ON TABLE items IS 'Content items for review';
COMMENT ON TABLE chunks IS 'Text chunks with embeddings for items';
COMMENT ON TABLE review_sessions IS 'Review sessions tracking review progress';
COMMENT ON TABLE credentials IS 'External platform credentials for scraping';

COMMENT ON COLUMN items.url_hash IS 'SHA256 hash of URL for deduplication';
COMMENT ON COLUMN items.scrape_status IS 'pending, scraped, error, skipped';
COMMENT ON COLUMN items.review_status IS 'pending, reviewing, completed, removed';
COMMENT ON COLUMN chunks.embedding IS 'OpenAI embedding vector (1536 dimensions)';
COMMENT ON COLUMN review_sessions.nudge_sent IS 'Whether reminder nudge was sent to user';

-- Create updated_at trigger for users table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- RLS policies removed for local development (no Supabase authenticated role)
