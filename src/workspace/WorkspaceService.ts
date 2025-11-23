import * as vscode from 'vscode';
import * as path from 'path';

export interface FileInfo {
    path: string;
    relativePath: string;
    name: string;
    content?: string;
    language?: string;
}

export interface WorkspaceContext {
    workspaceName: string;
    workspacePath: string;
    openFiles: FileInfo[];
    activeFile: FileInfo | null;
    selectedText: string | null;
    recentFiles: FileInfo[];
}

export class WorkspaceService {
    // Get the current workspace context
    async getContext(): Promise<WorkspaceContext | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const workspaceFolder = workspaceFolders[0];
        const workspacePath = workspaceFolder.uri.fsPath;
        const workspaceName = workspaceFolder.name;

        // Get active editor info
        const activeEditor = vscode.window.activeTextEditor;
        let activeFile: FileInfo | null = null;
        let selectedText: string | null = null;

        if (activeEditor) {
            const doc = activeEditor.document;
            activeFile = {
                path: doc.uri.fsPath,
                relativePath: path.relative(workspacePath, doc.uri.fsPath),
                name: path.basename(doc.uri.fsPath),
                content: doc.getText(),
                language: doc.languageId
            };

            // Get selected text if any
            const selection = activeEditor.selection;
            if (!selection.isEmpty) {
                selectedText = doc.getText(selection);
            }
        }

        // Get all open files
        const openFiles: FileInfo[] = [];
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.uri.scheme === 'file') {
                openFiles.push({
                    path: doc.uri.fsPath,
                    relativePath: path.relative(workspacePath, doc.uri.fsPath),
                    name: path.basename(doc.uri.fsPath),
                    language: doc.languageId
                });
            }
        }

        return {
            workspaceName,
            workspacePath,
            openFiles,
            activeFile,
            selectedText,
            recentFiles: [] // Could be populated from recent file history
        };
    }

    // Read a specific file by path (relative or absolute)
    async readFile(filePath: string): Promise<FileInfo | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return null;

        const workspacePath = workspaceFolders[0].uri.fsPath;

        // Handle relative paths
        let absolutePath = filePath;
        if (!path.isAbsolute(filePath)) {
            absolutePath = path.join(workspacePath, filePath);
        }

        try {
            const uri = vscode.Uri.file(absolutePath);
            const doc = await vscode.workspace.openTextDocument(uri);

            return {
                path: absolutePath,
                relativePath: path.relative(workspacePath, absolutePath),
                name: path.basename(absolutePath),
                content: doc.getText(),
                language: doc.languageId
            };
        } catch (error) {
            console.error(`[WorkspaceService] Failed to read file: ${filePath}`, error);
            return null;
        }
    }

    // Read multiple files
    async readFiles(filePaths: string[]): Promise<FileInfo[]> {
        const files: FileInfo[] = [];
        for (const filePath of filePaths) {
            const file = await this.readFile(filePath);
            if (file) {
                files.push(file);
            }
        }
        return files;
    }

    // Search for files matching a pattern
    async findFiles(pattern: string, maxResults: number = 50): Promise<FileInfo[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxResults);

        return uris.map(uri => ({
            path: uri.fsPath,
            relativePath: path.relative(workspacePath, uri.fsPath),
            name: path.basename(uri.fsPath)
        }));
    }

    // Get a summary of the workspace structure
    async getWorkspaceSummary(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return 'No workspace open';

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const workspaceName = workspaceFolders[0].name;

        // Find key files
        const packageJson = await this.findFiles('**/package.json', 5);
        const tsConfig = await this.findFiles('**/tsconfig.json', 3);
        const readme = await this.findFiles('**/README.md', 1);

        // Get file type counts
        const allFiles = await this.findFiles('**/*.*', 500);
        const extensions: Record<string, number> = {};

        for (const file of allFiles) {
            const ext = path.extname(file.name).toLowerCase();
            if (ext) {
                extensions[ext] = (extensions[ext] || 0) + 1;
            }
        }

        // Sort by count
        const sortedExts = Object.entries(extensions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let summary = `Workspace: ${workspaceName}\n`;
        summary += `Path: ${workspacePath}\n\n`;

        summary += `File types:\n`;
        for (const [ext, count] of sortedExts) {
            summary += `  ${ext}: ${count} files\n`;
        }

        if (packageJson.length > 0) {
            summary += `\nNode.js project detected (package.json found)\n`;
        }
        if (tsConfig.length > 0) {
            summary += `TypeScript project detected (tsconfig.json found)\n`;
        }

        return summary;
    }

    // Build context string for the AI model
    // Limit total context to avoid overwhelming the model
    async buildContextForPrompt(contextFiles: string[], maxChars: number = 50000): Promise<string> {
        let contextStr = '';
        let remainingChars = maxChars;

        // Always include active file context
        const context = await this.getContext();
        if (context) {
            contextStr += `## Workspace: ${context.workspaceName}\n\n`;
            remainingChars -= contextStr.length;

            if (context.selectedText && remainingChars > 0) {
                const selectedSection = `### Selected Text:\n\`\`\`\n${context.selectedText}\n\`\`\`\n\n`;
                if (selectedSection.length <= remainingChars) {
                    contextStr += selectedSection;
                    remainingChars -= selectedSection.length;
                }
            }

            if (context.activeFile && context.activeFile.content && remainingChars > 0) {
                const content = context.activeFile.content;
                // Truncate if too large
                const truncatedContent = content.length > remainingChars - 200
                    ? content.substring(0, remainingChars - 200) + '\n... (truncated)'
                    : content;

                const activeSection = `### Currently Active File: ${context.activeFile.relativePath}\nLanguage: ${context.activeFile.language}\n\`\`\`${context.activeFile.language || ''}\n${truncatedContent}\n\`\`\`\n\n`;
                contextStr += activeSection;
                remainingChars -= activeSection.length;
            }
        }

        // Add requested context files (with remaining space)
        if (contextFiles.length > 0 && remainingChars > 0) {
            const files = await this.readFiles(contextFiles);
            for (const file of files) {
                if (file.content && remainingChars > 500) {
                    const content = file.content;
                    // Truncate if needed
                    const truncatedContent = content.length > remainingChars - 200
                        ? content.substring(0, remainingChars - 200) + '\n... (truncated)'
                        : content;

                    const fileSection = `### File: ${file.relativePath}\n\`\`\`${file.language || ''}\n${truncatedContent}\n\`\`\`\n\n`;
                    contextStr += fileSection;
                    remainingChars -= fileSection.length;

                    if (remainingChars <= 0) break;
                }
            }
        }

        console.log(`[WorkspaceService] Built context: ${contextStr.length} chars (max: ${maxChars})`);
        return contextStr;
    }
}
