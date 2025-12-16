//! Git integration for file diffs.
//!
//! Provides functionality to get file contents from HEAD and working directory
//! for comparison in the diff viewer.

use git2::Repository;
use std::fs;
use std::path::Path;

/// Result of getting a git file diff - original (HEAD) and current content.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    /// Content of the file at HEAD (original)
    pub original: String,
    /// Current content of the file in working directory
    pub current: String,
    /// Whether the file exists at HEAD
    pub exists_at_head: bool,
    /// Whether the file exists in working directory
    pub exists_in_workdir: bool,
}

/// Get the original (HEAD) and current content of a file for diff comparison.
///
/// # Arguments
/// * `project_path` - Path to the project/repository root
/// * `file_path` - Relative path to the file within the project
pub fn get_git_file_diff(project_path: &str, file_path: &str) -> Result<GitFileDiff, String> {
    let repo = Repository::open(project_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    // Get HEAD commit
    let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to get HEAD commit: {}", e))?;
    let head_tree = head_commit
        .tree()
        .map_err(|e| format!("Failed to get HEAD tree: {}", e))?;

    // Try to get file content from HEAD
    let (original, exists_at_head) = match head_tree.get_path(Path::new(file_path)) {
        Ok(entry) => {
            let obj = entry
                .to_object(&repo)
                .map_err(|e| format!("Failed to get object: {}", e))?;
            let blob = obj
                .as_blob()
                .ok_or_else(|| "Entry is not a blob".to_string())?;
            let content = String::from_utf8_lossy(blob.content()).to_string();
            (content, true)
        }
        Err(_) => {
            // File doesn't exist at HEAD (new file)
            (String::new(), false)
        }
    };

    // Get current file content from working directory
    let full_path = Path::new(project_path).join(file_path);
    let (current, exists_in_workdir) = if full_path.exists() {
        let content = fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read current file: {}", e))?;
        (content, true)
    } else {
        // File was deleted
        (String::new(), false)
    };

    Ok(GitFileDiff {
        original,
        current,
        exists_at_head,
        exists_in_workdir,
    })
}
