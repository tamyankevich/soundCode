# Publishing soundCode to VS Code Marketplace

## Pre-Publishing Checklist

Before you can publish, you need to:

### 1. Update package.json

Replace the placeholder values in [package.json](package.json):

```json
"publisher": "YOUR_PUBLISHER_ID",  // Replace with your actual publisher ID
"repository": {
  "type": "git",
  "url": "https://github.com/YOUR_USERNAME/soundcode.git"  // Your GitHub repo
},
"bugs": {
  "url": "https://github.com/YOUR_USERNAME/soundcode/issues"  // Your issues page
}
```

### 2. Create a PNG Icon (Optional but Recommended)

The marketplace requires a PNG icon (128x128 or larger):

```bash
# Convert your SVG to PNG using ImageMagick, Inkscape, or an online tool
# The icon should be at least 128x128 pixels
# Save as icon.png in the root directory

# Then update package.json to add:
"icon": "icon.png"
```

### 3. Ensure No Secrets in Code

✅ Already done! Your code uses environment variables and VS Code settings for API keys.

**Double-check:**
```bash
# Make sure .env is in .gitignore
grep "^\.env$" .gitignore

# Make sure there are no hardcoded API keys
grep -r "AIza\|sk-\|xi-" src/
```

## Publishing Steps

### Step 1: Create Publisher Account

1. Go to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
2. Sign in with your Microsoft account
3. Click **"Create publisher"**
4. Fill in:
   - **Publisher ID**: Unique identifier (e.g., `yourname` or `yourcompany`)
   - **Display Name**: How it appears in the marketplace
   - **Description**: Brief description of who you are
5. Save your publisher ID - you'll need it for package.json

### Step 2: Create Personal Access Token (PAT)

1. Go to [Azure DevOps](https://dev.azure.com/)
2. Sign in with the same Microsoft account
3. Click your profile icon → **"Personal access tokens"**
4. Click **"New Token"**
5. Configure:
   - **Name**: `VS Code Marketplace`
   - **Organization**: All accessible organizations
   - **Expiration**: Choose your preference (90 days, custom, or 1 year)
   - **Scopes**: Click "Show all scopes" → Check **"Marketplace: Manage"**
6. Click **"Create"**
7. **IMPORTANT**: Copy the token immediately (you won't see it again!)
8. Store it securely (password manager, etc.)

### Step 3: Install vsce CLI

```bash
npm install -g @vscode/vsce
```

### Step 4: Update package.json

1. Replace `YOUR_PUBLISHER_ID` with your actual publisher ID
2. Replace `YOUR_USERNAME` with your GitHub username
3. Update version if needed

### Step 5: Test Build Locally

```bash
# Compile TypeScript
npm run compile

# Package the extension (creates .vsix file)
vsce package

# Test the packaged extension locally
code --install-extension soundcode-0.0.1.vsix
```

If packaging succeeds, you'll see `soundcode-0.0.1.vsix` in your directory.

### Step 6: Login to Marketplace

```bash
vsce login YOUR_PUBLISHER_ID
```

When prompted, paste your Personal Access Token.

### Step 7: Publish!

```bash
# Publish current version
vsce publish

# Or bump version and publish in one command:
vsce publish patch   # 0.0.1 → 0.0.2
vsce publish minor   # 0.0.1 → 0.1.0
vsce publish major   # 0.0.1 → 1.0.0
```

### Step 8: Verify Publication

1. Go to [marketplace.visualstudio.com](https://marketplace.visualstudio.com/)
2. Search for "soundCode"
3. Check that all information displays correctly
4. Test installing it: `code --install-extension YOUR_PUBLISHER_ID.soundcode`

## Updating Your Extension

When you make changes and want to publish an update:

```bash
# Make your changes
npm run compile

# Bump version and publish
vsce publish patch  # For bug fixes
vsce publish minor  # For new features
vsce publish major  # For breaking changes
```

## Common Issues

### "Missing publisher name"
- Make sure `"publisher"` field in package.json is set to your publisher ID

### "SVG icons are not allowed"
- Remove the `"icon"` field or convert your SVG to PNG (128x128+)

### "ERROR No README found"
- You have one! Make sure README.md is in the root directory

### "ERROR LICENSE not found"
- You have one! Make sure LICENSE file is in the root directory

### "Authentication failed"
- Your PAT may have expired - create a new one in Azure DevOps
- Make sure you selected "Marketplace: Manage" scope

### "Extension already exists"
- The name is taken - change `"name"` in package.json to something unique

## Best Practices

1. **Semantic Versioning**: Use semver (major.minor.patch)
   - Patch: Bug fixes (0.0.1 → 0.0.2)
   - Minor: New features (0.0.2 → 0.1.0)
   - Major: Breaking changes (0.1.0 → 1.0.0)

2. **Changelog**: Create a CHANGELOG.md to document changes

3. **Test Before Publishing**: Always test the packaged .vsix locally first

4. **Keep Secrets Safe**: Never commit API keys, always use .env

5. **Update README**: Keep setup instructions current

## Unpublishing

If you need to remove your extension:

```bash
vsce unpublish YOUR_PUBLISHER_ID.soundcode
```

**Warning**: This removes it for all users immediately.

## Resources

- [VS Code Publishing Documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Manifest Reference](https://code.visualstudio.com/api/references/extension-manifest)
- [Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
