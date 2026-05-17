# Commit, Push, and Create PR

Commit all staged and unstaged changes, push to remote, and create a pull request.

## Instructions

1. Run `git status` and `git diff` to see all changes
2. Run `git log --oneline -5` to see recent commit style
3. Generate a descriptive commit message based on the changes (do NOT add yourself as co-author)
4. Create a new branch from the current branch:
   - Use a descriptive branch name based on the changes (e.g., `fix/chat-formatting`, `feat/add-auth`)
   - Format: `<type>/<short-description>` where type is `feat`, `fix`, `refactor`, `docs`, `chore`, etc.
   - Run `git checkout -b <branch-name>`
5. Stage all changes with `git add -A` (or stage specific files if appropriate)
6. Commit the changes
7. Push the new branch with `-u origin <branch-name>`
8. Create a PR using `gh pr create` with:
   - A clear, concise title
   - A body with a summary section and test plan
   - NOT as a draft (ready for review)
9. Return the PR URL to the user
