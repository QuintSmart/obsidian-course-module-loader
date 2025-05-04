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
	FuzzySuggestModal,
	FuzzyMatch
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
		contentEl.createEl('h2', { text: 'Enter Course Module URL' });

		// Input field for the URL
		new Setting(contentEl)
			.setName('URL')
			.addText((text) =>
				text.onChange((value) => {
					this.result = value.trim();
				})
				.inputEl.focus()); // Focus the input field automatically

		// Submit button
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Download and Unzip')
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
		contentEl.addEventListener('keypress', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault(); // Prevent default Enter behavior
				if (this.result) {
					this.close();
					this.onSubmit(this.result);
				} else {
					new Notice("Please enter a URL.");
				}
			}
		});
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}


// ----------------------------------------
//  Folder Suggest Modal Class (Using Type Guard)
// ----------------------------------------
class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	plugin: CourseMaterialPlugin;
	settingDisplayElement: HTMLInputElement;
	preFetchedFolders: TFolder[] | null; // To store the list passed from settings tab

	constructor(app: App, plugin: CourseMaterialPlugin, settingDisplayElement: HTMLInputElement, folders: TFolder[]) {
		super(app);
		this.plugin = plugin;
		this.settingDisplayElement = settingDisplayElement;
		this.preFetchedFolders = folders; // Store the passed list
		this.setPlaceholder("Search for a folder...");
	}

	getItems(): TFolder[] {
		// Prioritize the pre-fetched list if available
		if (this.preFetchedFolders) {
			return this.preFetchedFolders;
		}

		// Fallback: Fetch if list wasn't provided
		console.warn("FolderSuggestModal: Pre-fetched list not available, fetching manually.");
		// --- USE TYPE GUARD & REMOVE CAST ---
		const folders = this.app.vault.getAllLoadedFiles()
							.filter(isTFolder); // Use the type guard function
        const root = this.app.vault.getRoot();
        if (!folders.some(f => f.path === '/')) {
             folders.unshift(root);
        }
		// TypeScript should now correctly infer the type as TFolder[]
		return folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path === '/' ? '/ (Vault Root)' : folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		const selectedPath = folder.path;
		this.plugin.settings.targetFolder = selectedPath;
		this.plugin.saveSettings();
		new Notice(`Target folder set to: ${selectedPath}`);
		this.settingDisplayElement.value = selectedPath;
	}

    renderSuggestion(item: FuzzyMatch<TFolder>, el: HTMLElement): void {
        super.renderSuggestion(item, el);
        if (item.item.path === '/') {
             const existingText = el.querySelector('.suggestion-content');
             if (existingText) existingText.textContent = '/ (Vault Root)';
             else el.setText('/ (Vault Root)');
        }
    }
}


// ----------------------------------------
//  Settings Tab Class (Using Type Guard)
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
		containerEl.createEl('h2', { text: 'Course Material Downloader Settings' });

		const setting = new Setting(containerEl)
			.setName('Target Folder')
			.setDesc('The folder where downloaded modules will be unzipped.');

		setting.addText(text => {
			text.setValue(this.plugin.settings.targetFolder).setDisabled(true);
			text.inputEl.addClass('course-material-downloader-wide-input');
			const displayElement = text.inputEl;

			setting.addButton(button => {
				button.setButtonText('Change Folder')
					.onClick(() => {
						// --- USE TYPE GUARD & REMOVE CAST ---
						const currentFolders = this.app.vault.getAllLoadedFiles()
                                    .filter(isTFolder); // Use the type guard function
						const root = this.app.vault.getRoot();
						if (!currentFolders.some(f => f.path === '/')) {
							currentFolders.unshift(root);
						}
						// TypeScript should now correctly infer the type as TFolder[]
						new FolderSuggestModal(this.app, this.plugin, displayElement, currentFolders).open();
					});
			});
		});

		containerEl.createEl('p', { text: 'Note: If the desired folder doesn\'t exist, it will be created during the download process (if possible).' });
	}
}


// ----------------------------------------
//  Main Plugin Class (Cleaned up logs)
// ----------------------------------------
export default class CourseMaterialPlugin extends Plugin {
	settings: CourseMaterialPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'download-course-module',
			name: 'Download and Unzip Course Module',
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

	// --- Helper to ensure folder exists (Handles existing files gracefully, cleaned logs) ---
	async ensureFolderExists(path: string): Promise<TFolder | null> {
		if (path === '/' || path === '') {
			return this.app.vault.getRoot();
		}
		let normalizedPath = path.replace(/^\/|\/$/g, '');
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


	// --- Main Download/Unzip Logic (Cleaned up logs) ---
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
		const cleanTargetFolderPath = targetFolder.path === '/' ? '' : targetFolder.path;


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
                const fullDestPath = cleanTargetFolderPath ? `${cleanTargetFolderPath}/${relativePath}` : relativePath;
				const normalizedDestPath = fullDestPath.replace(/\\/g, '/').replace(/\/+/g, '/');

				// Handle directories from zip
				if (zipEntry.dir) {
					const dirPath = normalizedDestPath.endsWith('/') ? normalizedDestPath.slice(0, -1) : normalizedDestPath;
					if (dirPath && !folderPathsCreated.has(dirPath)) {
						const folderExists = await this.ensureFolderExists(dirPath);
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
                    const parentPath = lastSlashIndex > 0 ? normalizedDestPath.substring(0, lastSlashIndex) : (lastSlashIndex === 0 ? '/' : '');

					// Ensure parent directory exists first
					if (parentPath && parentPath !== cleanTargetFolderPath && !folderPathsCreated.has(parentPath)) {
						const parentFolderExists = await this.ensureFolderExists(parentPath);
						if (!parentFolderExists) {
							console.warn(`Could not ensure parent directory exists: ${parentPath}. Skipping file: ${normalizedDestPath}`);
							continue;
						} else {
							folderPathsCreated.add(parentPath);
						}
					}

					const pathToCheck = normalizedDestPath.startsWith('/') ? normalizedDestPath.substring(1) : normalizedDestPath;
					if (pathToCheck === '' && normalizedDestPath === '/') {
						console.warn("Attempting to check root path '/' for a file. Skipping.");
						continue;
					}
					const existingItem = pathToCheck ? this.app.vault.getAbstractFileByPath(pathToCheck) : null;

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
