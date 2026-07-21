# Optional: set Railway builder to Dockerfile for reproducible builds
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js aiGuardrails.js hrAgent.js hrSubmissionStore.js ./
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
