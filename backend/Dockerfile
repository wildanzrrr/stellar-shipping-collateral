# Stage 1: Dependencies
FROM node:23-alpine AS deps
WORKDIR /app

# Copy only the files needed to install dependencies
COPY package.json pnpm-lock.yaml* ./

# Install dependencies with pnpm
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# Stage 2: Build
FROM node:23-alpine AS builder
WORKDIR /app

# Copy node modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the application code
COPY . .

# Generate the Prisma client
RUN corepack enable pnpm && npx prisma generate

# Build the application
RUN corepack enable pnpm && pnpm build

# Stage 3: Production runtime
FROM node:23-alpine AS runner
WORKDIR /app

# Set NODE_ENV environment variable
ENV NODE_ENV=production

# Copy package.json for potential runtime references
COPY package.json ./

# Copy Prisma files for runtime usage
COPY prisma ./prisma

# Copy the bundled code from the builder stage
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy node_modules with Prisma client
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy config files (e.g. service-account.pem)
COPY --from=builder --chown=node:node /app/config ./config

# Expose the port the app runs on
EXPOSE 2000

# Use the node user from the image (security best practice)
USER node

# Start the server
CMD ["node", "dist/src/main.js"]