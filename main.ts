import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
	TFolder,
	TAbstractFile,
	Modal,
	TFile,
	// FuzzySuggestModal, // No longer needed
	// FuzzyMatch, // No longer needed
	AbstractInputSuggest, // For new folder input
	normalizePath // For path normalization
} from 'obsidian';
import JSZip from 'jszip'; // Keep this import as is with allowSyntheticDefaultImports: true

// Settings Interface
interface CourseMaterialPluginSettings {
	targetFolder: string;
}

// Default Settings
const DEFAULT_SETTINGS: CourseMaterialPluginSettings = {
	targetFolder: 'Course Modules' // Default folder name
}

// --- Type Guard Function ---
// This function explicitly checks if a file is a TFolder and tells TypeScript
function isTFolder(file: TAbstractFile): file is TFolder {
    return file instanceof TFolder;
}
// --- End Type Guard ---


// ----------------------------------------
//  URL Input Modal Class
// ----------------------------------------
class UrlInputModal extends Modal {
	result: string = '';
	onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		// --- SENTENCE CASE ---
		contentEl.createEl('h2', { text: 'Enter course module URL' });

		// Input field for the URL
		new Setting(contentEl)
			.setName('URL') // Typically, setting names can be Title Case
			.addText((text) =>
				text.onChange((value) => {
					this.result = value.trim();
				})
				.inputEl.focus()); // Focus the input field automatically

		// Submit button
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					// --- SENTENCE CASE ---
					.setButtonText('Download and unzip')
					.setCta() // Makes the button more prominent
					.onClick(() => {
						if (this.result) {
							this.close();
							this.onSubmit(this.result);
						} else {
							new Notice("Please enter a URL.");
						}
					}));

		// Optional: Allow submitting with Enter key in the text input
		this.scope.register([], 'Enter', () => {
			if (this.result) {
					this.close();
					this.onSubmit(this.result);
				} else {
					new Notice("Please enter a URL.");
				}
		});
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

// ----------------------------------------
//  Folder Input Suggester Class (NEW - Replaces FolderSuggestModal)
// ----------------------------------------
class FolderInputSuggest extends AbstractInputSuggest<TFolder> {
    plugin: CourseMaterialPlugin;

    constructor(app: App, protected inputEl: HTMLInputElement, plugin: CourseMaterialPlugin) {
        super(app, inputEl);
        this.plugin = plugin;
    }

    getSuggestions(query: string): TFolder[] {
        const lowerCaseQuery = query.toLowerCase();
        const allFolders = this.app.vault.getAllLoadedFiles().filter(isTFolder);
        const root = this.app.vault.getRoot();

        const suggestions = allFolders.filter(folder =>
            folder.path.toLowerCase().includes(lowerCaseQuery)
        );

        // Ensure root is always an option if query is empty or matches root
        if (!suggestions.some(f => f.path === '/') && ('/ (vault root)'.toLowerCase().includes(lowerCaseQuery) || query === '')) {
            if (!suggestions.find(f => f.path === '/')) {
                 suggestions.unshift(root); // Add root if not present
            }
        }
        return suggestions;
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path === '/' ? '/ (Vault Root)' : folder.path);
    }

    selectSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
        const selectedPath = folder.path;
        this.plugin.settings.targetFolder = selectedPath;
        this.plugin.saveSettings();
        this.inputEl.value = selectedPath; // Update the input field's text
        this.close(); // Close the suggestion list
        new Notice(`Target folder set to: ${selectedPath}`);
    }
}


// ----------------------------------------
//  Settings Tab Class (MODIFIED - Using AbstractInputSuggest, no top heading, sentence case)
// ----------------------------------------
class CourseMaterialSettingTab extends PluginSettingTab {
	plugin: CourseMaterialPlugin;

	constructor(app: App, plugin: CourseMaterialPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- USE AbstractInputSuggest ---
		new Setting(containerEl)
			// --- SENTENCE CASE ---
			.setName('Target folder')
			.setDesc('The folder where downloaded modules will be unzipped. Type to search.')
			.addText(text => {
				text.setValue(this.plugin.settings.targetFolder)
					.setPlaceholder('Example: Course Materials/Week 1')
					.onChange(async (value) => {
						this.plugin.settings.targetFolder = value;
						await this.plugin.saveSettings();
					});
				// Apply CSS class for consistent styling if needed (from styles.css)
				text.inputEl.addClass('course-material-downloader-wide-input');
				// Attach the suggester
				new FolderInputSuggest(this.app, text.inputEl, this.plugin);
			});

		containerEl.createEl('p', { text: 'Note: If the desired folder doesn\'t exist, it will be created during the download process (if possible).' });
	}
}


// ----------------------------------------
//  Main Plugin Class (Cleaned up logs, sentence case command)
// ----------------------------------------
export default class CourseMaterialPlugin extends Plugin {
	settings: CourseMaterialPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'download-course-module',
			// --- SENTENCE CASE ---
			name: 'Download and unzip course module',
			callback: () => {
				this.showUrlInputModal();
			}
		});

		this.addSettingTab(new CourseMaterialSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup logic if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// --- Helper to ensure folder exists (Using normalizePath) ---
	async ensureFolderExists(path: string): Promise<TFolder | null> {
		// Use normalizePath for initial path cleaning
		let normalizedPath = normalizePath(path);

		// Handle root case explicitly after normalization
		if (normalizedPath === '/' || normalizedPath === '.') { // '.' can be result of normalizePath for empty or root-like
			return this.app.vault.getRoot();
		}
		// Remove leading/trailing slashes if normalizePath didn't already for consistency with getAbstractFileByPath
        // which often doesn't want a leading slash for non-root paths.
        // However, normalizePath should handle this well. Let's trust it.
        // If normalizedPath is empty after this, it implies root or invalid.
        if (normalizedPath === '') return this.app.vault.getRoot();


		try {
			const existingItem = this.app.vault.getAbstractFileByPath(normalizedPath);

			if (existingItem instanceof TFolder) {
				return existingItem;
			} else if (existingItem instanceof TFile) {
				console.error(`Cannot create folder '${normalizedPath}', a file with this name already exists.`);
				new Notice(`Cannot create folder '${normalizedPath}', a file exists there.`);
				return null;
			} else {
				try {
					const newFolder = await this.app.vault.createFolder(normalizedPath);
					new Notice(`Created folder: ${normalizedPath}`);
					return newFolder;
				} catch (creationError) {
					console.error(`Error creating folder '${normalizedPath}':`, creationError);
					const checkAgain = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (checkAgain instanceof TFolder) {
						return checkAgain;
					}
					new Notice(`Error creating folder '${normalizedPath}'. Check console.`);
					return null;
				}
			}
		} catch (error) {
			console.error(`Unexpected error ensuring folder exists '${normalizedPath}':`, error);
			new Notice(`Unexpected error checking folder '${normalizedPath}'. Check console.`);
			return null;
		}
	}


	// --- Method to open the URL Input Modal ---
	showUrlInputModal() {
		new UrlInputModal(this.app, (url) => {
			this.downloadAndUnzip(url);
		}).open();
	}


	// --- Main Download/Unzip Logic (Using normalizePath, cleaned logs) ---
	async downloadAndUnzip(url: string) {
		// --- 1. URL Validation & Dropbox Fix ---
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			new Notice('Invalid URL received. Must start with http:// or https://');
			return;
		}
		url = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
		if (url.includes('dropbox.com') && !url.includes('dl=1')) {
			url = url.includes('?') ? `${url}&dl=1` : `${url}?dl=1`;
		}

		// --- 2. Get Target Folder and Ensure It Exists ---
		const targetFolderPath = this.settings.targetFolder;
		const targetFolder = await this.ensureFolderExists(targetFolderPath);
		if (!targetFolder) {
			new Notice(`Target folder "${targetFolderPath}" could not be found or created. Aborting.`);
			return;
		}
		// Use the path from the TFolder object, especially important for root
		// normalizePath will ensure consistency
		const cleanTargetFolderPath = targetFolder.path === '/' ? '' : normalizePath(targetFolder.path);


		// --- 3. Download ---
		let zipData: ArrayBuffer;
		try {
			new Notice('Downloading module...');
			const response = await requestUrl({ url: url });
			zipData = response.arrayBuffer;
			new Notice('Download complete. Unzipping...');
		} catch (error) {
			console.error('Download Error:', error);
			new Notice(`Failed to download file: ${error.message}. Check console (Ctrl+Shift+I or Cmd+Opt+I).`);
			return;
		}

		// --- 4. Unzip and Write Files ---
		try {
			const zip = await JSZip.loadAsync(zipData);
			let fileCount = 0;
			let folderPathsCreated = new Set<string>();

			for (const relativePath in zip.files) {
				const fileName = relativePath.split('/').pop();
				if (relativePath.startsWith('__MACOSX/') || fileName === '.DS_Store' || !relativePath) {
					continue;
				}

				const zipEntry = zip.files[relativePath];
                // Construct full destination path, handling root folder case
                const fullDestPath = cleanTargetFolderPath ? `${cleanTargetFolderPath}/${relativePath}` : relativePath;
				// --- USE normalizePath ---
				const normalizedDestPath = normalizePath(fullDestPath);

				// Handle directories from zip
				if (zipEntry.dir) {
					// normalizePath handles trailing slashes, so direct use is fine
					const dirPath = normalizedDestPath;
					if (dirPath && !folderPathsCreated.has(dirPath)) {
						const folderExists = await this.ensureFolderExists(dirPath); // ensureFolderExists also uses normalizePath
						if (!folderExists) {
							console.warn(`Could not ensure directory exists: ${dirPath}. Skipping contents.`);
						} else {
							folderPathsCreated.add(dirPath);
						}
					}
				}
				// Handle files from zip
				else {
					const fileData = await zipEntry.async('arraybuffer');
                    const lastSlashIndex = normalizedDestPath.lastIndexOf('/');
                    // Parent path calculation needs care with normalizePath
                    let parentPath = lastSlashIndex > 0 ? normalizedDestPath.substring(0, lastSlashIndex) : (lastSlashIndex === 0 ? '/' : '');
                    parentPath = normalizePath(parentPath); // Ensure parent path is also normalized

					// Ensure parent directory exists first
					if (parentPath && parentPath !== (targetFolder.path === '/' ? '/' : cleanTargetFolderPath) && !folderPathsCreated.has(parentPath)) {
						const parentFolderExists = await this.ensureFolderExists(parentPath);
						if (!parentFolderExists) {
							console.warn(`Could not ensure parent directory exists: ${parentPath}. Skipping file: ${normalizedDestPath}`);
							continue;
						} else {
							folderPathsCreated.add(parentPath);
						}
					}

					// getAbstractFileByPath expects a path relative to the vault root, without a leading slash
					// if it's not the root itself. normalizePath should handle this.
					const pathToCheck = normalizedDestPath; // Trust normalizePath
					if (pathToCheck === '.' || pathToCheck === '/') { // Check for root explicitly
						console.warn("Attempting to check root path for a file. Skipping.");
						continue;
					}
					const existingItem = this.app.vault.getAbstractFileByPath(pathToCheck);


					if (existingItem instanceof TFile) {
						continue;

					} else if (existingItem instanceof TFolder) {
						console.error(`Skipping file write: A folder exists at path ${normalizedDestPath}`);
						new Notice(`Skipping file write: Folder exists at ${normalizedDestPath}`);
						continue;

					} else {
						// File does not exist. Create it.
						try {
							await this.app.vault.createBinary(normalizedDestPath, fileData, { mtime: Date.now() });
							fileCount++;
						} catch (writeError) {
							if (writeError.message?.toLowerCase().includes("file already exists")) {
								console.warn(`Caught 'File already exists' on createBinary for ${normalizedDestPath}. Skipping.`);
							} else {
								console.error(`Error creating file '${normalizedDestPath}':`, writeError);
								new Notice(`Error creating file '${normalizedDestPath}'. Check console.`);
							}
						}
					}
				}
			} // End of for loop

			new Notice(`Successfully extracted ${fileCount} new file(s) to '${targetFolder.path}'.`);

		} catch (error) {
			console.error('Unzip/Write Error:', error);
			if (error.message?.toLowerCase().includes("file already exists")) {
				console.warn("Caught 'File already exists' error during unzip/write phase, possibly handled. Check logic if files were missed.");
				new Notice("An unexpected 'File already exists' error occurred during processing. Some files might not have been processed correctly. Check console.");
			} else {
				new Notice(`Failed to unzip or write files: ${error.message}. Check console.`);
			}
		}
	}
}
