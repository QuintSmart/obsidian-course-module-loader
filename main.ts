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
	FuzzySuggestModal, // Needed for the searchable folder list
	FuzzyMatch      // Needed for highlighting search results
} from 'obsidian';
import JSZip from 'jszip';

// Settings Interface
interface CourseMaterialPluginSettings {
	targetFolder: string;
}

// Default Settings
const DEFAULT_SETTINGS: CourseMaterialPluginSettings = {
	targetFolder: 'Course Modules' // Default folder name
}

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
//  Folder Suggest Modal Class (MODIFIED to accept pre-fetched list)
// ----------------------------------------
class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	plugin: CourseMaterialPlugin;
	settingDisplayElement: HTMLInputElement;
	preFetchedFolders: TFolder[] | null; // To store the list passed from settings tab

	// --- MODIFIED CONSTRUCTOR ---
	constructor(app: App, plugin: CourseMaterialPlugin, settingDisplayElement: HTMLInputElement, folders: TFolder[]) {
		super(app);
		this.plugin = plugin;
		this.settingDisplayElement = settingDisplayElement;
		this.preFetchedFolders = folders; // Store the passed list
		this.setPlaceholder("Search for a folder...");
		console.log("FolderSuggestModal: Initialized with pre-fetched list containing", folders.length, "folders.");
	}

	// --- MODIFIED getItems ---
	// Get all folders including root
	getItems(): TFolder[] {
		// Prioritize the pre-fetched list if available
		if (this.preFetchedFolders) {
			console.log("FolderSuggestModal: Using pre-fetched folder list.");
			return this.preFetchedFolders;
		}

		// Fallback: Fetch if list wasn't provided (shouldn't happen with new settings tab logic)
		console.warn("FolderSuggestModal: Pre-fetched list not available, fetching manually.");
		const folders = this.app.vault.getAllLoadedFiles()
							.filter(file => file instanceof TFolder) as TFolder[];
        const root = this.app.vault.getRoot();
        if (!folders.some(f => f.path === '/')) {
             folders.unshift(root);
        }
		return folders;
	}

	// Text representation of each folder for searching and display
	getItemText(folder: TFolder): string {
		return folder.path === '/' ? '/ (Vault Root)' : folder.path; // Display the full path, special label for root
	}

	// Action when a folder is chosen
	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		const selectedPath = folder.path; // Path is '/' for root
		this.plugin.settings.targetFolder = selectedPath;
		this.plugin.saveSettings();
		new Notice(`Target folder set to: ${selectedPath}`);
		// Update the text display in the settings tab immediately
		this.settingDisplayElement.value = selectedPath;
	}

	// Optional: Render suggestions with highlighting (more advanced)
    renderSuggestion(item: FuzzyMatch<TFolder>, el: HTMLElement): void {
        // Use the default fuzzy match rendering provided by the parent class
        super.renderSuggestion(item, el);
        // Add special text for root folder
        if (item.item.path === '/') {
             const existingText = el.querySelector('.suggestion-content');
             if (existingText) existingText.textContent = '/ (Vault Root)';
             else el.setText('/ (Vault Root)'); // Fallback if structure changes
        }
    }
}


// ----------------------------------------
//  Settings Tab Class (MODIFIED - Fetch list on button click)
// ----------------------------------------
class CourseMaterialSettingTab extends PluginSettingTab {
	plugin: CourseMaterialPlugin;

	constructor(app: App, plugin: CourseMaterialPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty(); // Clear previous settings shown
		containerEl.createEl('h2', { text: 'Course Material Downloader Settings' });

		// --- MODIFIED Setting for Target Folder ---
		const setting = new Setting(containerEl) // Store the setting reference
			.setName('Target Folder')
			.setDesc('The folder where downloaded modules will be unzipped.');

		// Add a non-editable text element to display the current setting
		setting.addText(text => {
			text.setValue(this.plugin.settings.targetFolder).setDisabled(true);
			text.inputEl.style.width = '100%'; // Make the input field take full available width
			text.inputEl.style.marginRight = '10px'; // Add some space before the button
			const displayElement = text.inputEl; // Store the input element reference

			// Add the button to the same setting control container
			setting.addButton(button => { // Add button directly to the 'setting' object
				button.setButtonText('Change Folder')
					.setCta(false) // Less prominent than main action buttons
					.onClick(() => {
						// --- FETCH FOLDER LIST HERE ---
						console.log("Settings Tab: 'Change Folder' clicked. Fetching folder list...");
						const currentFolders = (this.app.vault.getAllLoadedFiles()
                                    .filter(file => file instanceof TFolder) as TFolder[]);
						// Ensure root is included if needed (getAllLoadedFiles usually includes it)
						const root = this.app.vault.getRoot();
						if (!currentFolders.some(f => f.path === '/')) {
							currentFolders.unshift(root);
						}
            			console.log("Settings Tab: Passing", currentFolders.length, "folders to modal.");

						// --- PASS LIST TO MODAL ---
						// Open the suggester modal when button is clicked, passing the fetched list
						new FolderSuggestModal(this.app, this.plugin, displayElement, currentFolders).open();
					});
			});
		});


		// Note about folder creation (still relevant)
		containerEl.createEl('p', { text: 'Note: If the desired folder doesn\'t exist, it will be created during the download process (if possible).' });
	}
}


// ----------------------------------------
//  Main Plugin Class
// ----------------------------------------
export default class CourseMaterialPlugin extends Plugin {
	settings: CourseMaterialPluginSettings;

	async onload() {
		console.log('Loading Course Material Downloader Plugin');
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
		console.log('Unloading Course Material Downloader Plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// --- Helper to ensure folder exists (Handles existing files gracefully) ---
	async ensureFolderExists(path: string): Promise<TFolder | null> {
		// Handle root case explicitly
		if (path === '/' || path === '') {
			return this.app.vault.getRoot();
		}

		// Normalize path slightly (remove leading/trailing slashes for consistency)
		let normalizedPath = path.replace(/^\/|\/$/g, '');
		if (normalizedPath === '') return this.app.vault.getRoot();


		try {
			const existingItem = this.app.vault.getAbstractFileByPath(normalizedPath);

			if (existingItem instanceof TFolder) {
				// Folder already exists, all good.
				return existingItem;
			} else if (existingItem instanceof TFile) {
				// A file exists with this name, cannot create folder here.
				console.error(`Cannot create folder '${normalizedPath}', a file with this name already exists.`);
				new Notice(`Cannot create folder '${normalizedPath}', a file exists there.`);
				return null; // Indicate failure
			} else {
				// Folder doesn't exist, try to create it
				console.log(`Attempting to create folder: ${normalizedPath}`);
				try {
					const newFolder = await this.app.vault.createFolder(normalizedPath);
					new Notice(`Created folder: ${normalizedPath}`);
					return newFolder; // Return the newly created folder object
				} catch (creationError) {
					// Handle potential errors during creation itself
					console.error(`Error creating folder '${normalizedPath}':`, creationError);
					const checkAgain = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (checkAgain instanceof TFolder) {
						console.log(`Folder '${normalizedPath}' found after initial creation attempt failed.`);
						return checkAgain; // It exists now, return it
					}
					new Notice(`Error creating folder '${normalizedPath}'. Check console.`);
					return null; // Indicate failure
				}
			}
		} catch (error) {
			// Catch errors during the initial getAbstractFileByPath or other unexpected issues
			console.error(`Unexpected error ensuring folder exists '${normalizedPath}':`, error);
			new Notice(`Unexpected error checking folder '${normalizedPath}'. Check console.`);
			return null; // Indicate failure
		}
	}


	// --- Method to open the URL Input Modal ---
	showUrlInputModal() {
		new UrlInputModal(this.app, (url) => {
			this.downloadAndUnzip(url);
		}).open();
	}


	// --- Main Download/Unzip Logic (Handles skipping existing files & macOS metadata) ---
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
		// Use ensureFolderExists to handle root ('/') correctly now
		const targetFolder = await this.ensureFolderExists(targetFolderPath);
		if (!targetFolder) {
			new Notice(`Target folder "${targetFolderPath}" could not be found or created. Aborting.`);
			return;
		}
		// Use the path from the TFolder object, especially important for root
		const cleanTargetFolderPath = targetFolder.path === '/' ? '' : targetFolder.path;


		// --- 3. Download ---
		let zipData: ArrayBuffer;
		try {
			new Notice('Downloading module...');
			console.log(`Requesting URL: ${url}`);
			const response = await requestUrl({ url: url });
			zipData = response.arrayBuffer;
			new Notice('Download complete. Unzipping...');
			console.log(`Downloaded ${zipData.byteLength} bytes.`);
		} catch (error) {
			console.error('Download Error:', error);
			new Notice(`Failed to download file: ${error.message}. Check console (Ctrl+Shift+I or Cmd+Opt+I).`);
			return;
		}

		// --- 4. Unzip and Write Files ---
		try {
			const zip = await JSZip.loadAsync(zipData);
			let fileCount = 0;
			let folderPathsCreated = new Set<string>(); // Track created folders

			for (const relativePath in zip.files) {
				// Skip macOS metadata (__MACOSX, .DS_Store) and empty paths
				const fileName = relativePath.split('/').pop(); // Get the actual filename part
				if (relativePath.startsWith('__MACOSX/') || fileName === '.DS_Store' || !relativePath) {
					if(relativePath.startsWith('__MACOSX/')) console.log(`Ignoring macOS metadata folder: ${relativePath}`);
					if(fileName === '.DS_Store') console.log(`Ignoring .DS_Store file: ${relativePath}`);
					continue; // Skip this entry
				}


				const zipEntry = zip.files[relativePath];
				// Construct full destination path, handling root folder case
                const fullDestPath = cleanTargetFolderPath ? `${cleanTargetFolderPath}/${relativePath}` : relativePath;
				const normalizedDestPath = fullDestPath.replace(/\\/g, '/').replace(/\/+/g, '/');

				// Handle directories from zip
				if (zipEntry.dir) {
					// Remove trailing slash for ensureFolderExists if present
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
					// Extract parent path correctly, handling root case
                    const lastSlashIndex = normalizedDestPath.lastIndexOf('/');
                    const parentPath = lastSlashIndex > 0 ? normalizedDestPath.substring(0, lastSlashIndex) : (lastSlashIndex === 0 ? '/' : '');


					// Ensure parent directory exists first
					if (parentPath && parentPath !== cleanTargetFolderPath && !folderPathsCreated.has(parentPath)) {
						const parentFolderExists = await this.ensureFolderExists(parentPath);
						if (!parentFolderExists) {
							console.warn(`Could not ensure parent directory exists: ${parentPath}. Skipping file: ${normalizedDestPath}`);
							continue; // Skip this file if parent folder failed
						} else {
							folderPathsCreated.add(parentPath);
						}
					}

					// Check if item exists at the destination path
					// Use the normalized path for checking
					// Handle root path correctly for getAbstractFileByPath (doesn't want leading '/')
					const pathToCheck = normalizedDestPath.startsWith('/') ? normalizedDestPath.substring(1) : normalizedDestPath;
					// Ensure pathToCheck is not empty if normalizedDestPath was just '/'
					if (pathToCheck === '' && normalizedDestPath === '/') {
						// This case shouldn't happen for files, but defensively handle
						console.warn("Attempting to check root path '/' for a file. Skipping.");
						continue;
					}
					// Check if pathToCheck is not empty before calling getAbstractFileByPath
					const existingItem = pathToCheck ? this.app.vault.getAbstractFileByPath(pathToCheck) : null;


					if (existingItem instanceof TFile) {
						// File already exists. Skip extracting this file.
						console.log(`Skipping extraction for existing file: ${normalizedDestPath}`);
						continue; // Skip to the next item in the zip loop

					} else if (existingItem instanceof TFolder) {
						// Cannot replace a folder with a file.
						console.error(`Skipping file write: A folder exists at path ${normalizedDestPath}`);
						new Notice(`Skipping file write: Folder exists at ${normalizedDestPath}`);
						continue; // Skip to the next item in the zip loop

					} else {
						// File does not exist. Create it.
						try {
							console.log(`Creating new file: ${normalizedDestPath}`);
							await this.app.vault.createBinary(normalizedDestPath, fileData, { mtime: Date.now() });
							fileCount++; // Increment count ONLY when a new file is created
						} catch (writeError) {
							// Check if the specific error is "File already exists" which might happen
							// despite our checks due to timing or case sensitivity differences.
							if (writeError.message?.toLowerCase().includes("file already exists")) {
								console.warn(`Caught 'File already exists' on createBinary for ${normalizedDestPath}. Skipping.`);
							} else {
								// Handle other unexpected write errors
								console.error(`Error creating file '${normalizedDestPath}':`, writeError);
								new Notice(`Error creating file '${normalizedDestPath}'. Check console.`);
							}
						}
					}
				}
			} // End of for loop

			new Notice(`Successfully extracted ${fileCount} new file(s) to '${targetFolder.path}'.`);
			console.log(`Extraction complete to folder: ${targetFolder.path}`);

		} catch (error) {
			console.error('Unzip/Write Error:', error);
			// General catch block for errors during JSZip processing or unexpected issues
			if (error.message?.toLowerCase().includes("file already exists")) {
				console.warn("Caught 'File already exists' error during unzip/write phase, possibly handled. Check logic if files were missed.");
				new Notice("An unexpected 'File already exists' error occurred during processing. Some files might not have been processed correctly. Check console.");
			} else {
				new Notice(`Failed to unzip or write files: ${error.message}. Check console.`);
			}
		}
	}
}
