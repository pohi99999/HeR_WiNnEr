<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1sIeHeLiS7TTJMgjLVZMIsey_2GhRDXdb

## Run Locally

**Prerequisites:**  Node.js (v18 vagy újabb)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

5. Preview production build:
   ```bash
   npm run preview
   ```

## Deploy to Netlify

### Option 1: Deploy via Netlify CLI

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Login to Netlify:
   ```bash
   netlify login
   ```

3. Initialize and deploy:
   ```bash
   netlify init
   netlify deploy --prod
   ```

### Option 2: Deploy via GitHub

1. Push your code to GitHub repository
2. Go to [Netlify](https://app.netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Choose your GitHub repository
5. Netlify will automatically detect the build settings from `netlify.toml`
6. Add your environment variable in Netlify dashboard:
   - Go to Site settings → Environment variables
   - Add `GEMINI_API_KEY` with your API key
7. Click "Deploy site"

### Option 3: Manual Deploy

1. Build your app:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to Netlify:
   ```bash
   netlify deploy --dir=dist --prod
   ```

## Environment Variables

Make sure to set these environment variables in Netlify:
- `GEMINI_API_KEY`: Your Gemini API key

## Optimization Features

✅ **Code Splitting**: Automatic vendor and feature-based chunking  
✅ **Minification**: Using esbuild for fast builds  
✅ **Security Headers**: XSS protection, frame options, content security  
✅ **Asset Caching**: Static assets cached for 1 year  
✅ **SPA Routing**: Proper redirects for client-side routing  
✅ **Clean Build**: Optimized for production deployment
