FROM oven/bun:latest

# Install Python (required for trafilatura)
RUN apt-get update && apt-get install -y python3 python3-pip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install trafilatura via pip
RUN pip3 install trafilatura

# Copy dependencies first for better caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose application port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]
