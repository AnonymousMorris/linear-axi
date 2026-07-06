Output docs/demo.gif
Require node
Require zsh

Set Shell "zsh"
Set FontSize 16
Set Width 1280
Set Height 720
Set Framerate 16
Set PlaybackSpeed 1.50
Set TypingSpeed 50ms
Set Theme "tokyonight-storm"

Hide
Type "[[ -r /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
Enter
Sleep 100ms
Type "DEMO_DIR=$(mktemp -d)"
Enter
Sleep 600ms
Type 'git -C "$DEMO_DIR" init -q'
Enter
Sleep 600ms
Type 'cd "$DEMO_DIR"'
Enter
Sleep 600ms
Type "STAMP=$(date +%H%M%S)"
Enter
Sleep 600ms
Type 'PROJECT="AXI Demo $STAMP"'
Enter
Sleep 600ms
Type 'ISSUE_TITLE="Demo: wire the agent handoff $STAMP"'
Enter
Sleep 1400ms
Type "clear"
Enter
Sleep 1000ms
Show

Type "linear-axi"
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type "linear-axi teams list --fields key,name --limit 5"
Enter
Sleep 3s
Hide
Type "TEAM=$(linear-axi teams list --fields key --limit 1 | awk '/^  / { print $1; exit }')"
Enter
Sleep 100ms
Type "clear"
Enter
Sleep 200ms
Show

Type 'linear-axi projects list --query "$PROJECT" --fields id,name,status --limit 5'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type 'linear-axi projects create --name "$PROJECT" --team "$TEAM" --summary "Short-lived demo project for the CLI walkthrough" | tee project.out'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Hide
Type "PROJECT_ID=$(awk '/  id: / { print $2; exit }' project.out)"
Enter
Sleep 60ms
Type "PROJECT_CLEANED="
Enter
Sleep 60ms
Type 'cleanup_project() { [[ -n "$PROJECT_ID" && -z "$PROJECT_CLEANED" ]] && linear-axi projects update --id "$PROJECT_ID" --state canceled >/dev/null; }'
Enter
Sleep 60ms
Type "trap cleanup_project EXIT"
Enter
Sleep 60ms
Type "clear"
Enter
Sleep 500ms
Show
Type 'linear-axi init --project "$PROJECT"'
Enter
Sleep 1s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type "linear-axi"
Enter
Sleep 4.5s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type 'linear-axi issues create --title "$ISSUE_TITLE" --team "$TEAM" --assignee me --priority 2 | tee issue.out'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Hide
Type "ISSUE_ID=$(awk '/  id: / { print $2; exit }' issue.out)"
Enter
Sleep 60ms
Type "clear"
Enter
Sleep 500ms
Show
Type 'linear-axi issues list --assignee me --project "$PROJECT" --fields id,title,state,priority --limit 5'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type 'linear-axi issues view "$ISSUE_ID"'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type 'linear-axi comments create --issue "$ISSUE_ID" --body "Starting this now; demo captured the project setup and issue lookup."'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type 'linear-axi comments list --issue "$ISSUE_ID"'
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type "linear-axi issues view all"
Enter
Sleep 3s
Hide
Type "clear"
Enter
Sleep 500ms
Show

Type 'linear-axi projects update --id "$PROJECT_ID" --state canceled'
Enter
Sleep 3s
Hide
Type "PROJECT_CLEANED=1"
Enter
Sleep 60ms
