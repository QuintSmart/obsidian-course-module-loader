# Course Module Loader

This plugin for Obsidian allows users, such as course attendees, to easily download and unzip course materials directly into their vault from a provided URL.

## Features

* **Download from URL:** Downloads a zip file containing course materials from any direct download URL (including Dropbox links formatted for direct download).
* **Unzip into Vault:** Automatically unzips the downloaded content into a specified folder within the current Obsidian vault.
* **Configurable Target Folder:** Users can select the target folder using a searchable folder list in the plugin settings.
* **Skip Existing Files:** If a file with the same name already exists in the target folder, the plugin will skip extracting that file from the zip, preserving existing user data.
* **Folder Creation:** Automatically creates necessary subfolders within the target folder as defined in the zip file structure.
* **Ignores Metadata Files:** Automatically skips macOS-specific metadata files (`__MACOSX` folders and `.DS_Store` files) during extraction.

## How to Use

1.  **Install the Plugin:** Once available, install the plugin from the Obsidian Community Plugins browser.
2.  **Configure Settings:**
    * Go to Obsidian `Settings` -> `Community Plugins` -> `Course Module Loader` (or the name you chose).
    * Click the `Change Folder` button next to the "Target Folder" setting.
    * A searchable list of your vault folders will appear. Search for and select the desired folder where you want course materials to be saved (e.g., "My Course Notes/Modules", "Downloads"). The root folder `/` is also selectable.
    * The selected folder path will be displayed.
3.  **Download a Module:**
    * Open the Obsidian Command Palette (default `Ctrl+P` or `Cmd+P`).
    * Search for and run the command: `Download and Unzip Course Module`.
    * A modal window will appear asking for the URL of the zip file.
    * Paste the direct download URL for the course module zip file (e.g., a Dropbox link ending in `?dl=1`).
    * Click `Download and Unzip`.
4.  **Check Results:** The plugin will show notices indicating download progress and completion. The files will be extracted into your chosen target folder, skipping any files that already existed.

## Compatibility

Requires Obsidian version 1.0.0 or newer.

## Installation (From Community Plugins)

1.  Open `Settings` -> `Community Plugins`.
2.  Make sure "Safe mode" is **off**.
3.  Click `Browse` community plugins.
4.  Search for "Course Module Loader".
5.  Click `Install`.
6.  Once installed, close the community plugins window and **enable** the plugin under "Installed plugins".

## License

This plugin is released under the [MIT License](LICENSE).
