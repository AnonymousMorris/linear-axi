Output docs/demo.gif
Require node

Set Shell "bash"
Set FontSize 16
Set Width 1280
Set Height 720
Set TypingSpeed 35ms
Set Theme {"name":"linear-axi","black":"#1e1e2e","red":"#f38ba8","green":"#a6e3a1","yellow":"#f9e2af","blue":"#89b4fa","magenta":"#cba6f7","cyan":"#94e2d5","white":"#cdd6f4","brightBlack":"#585b70","brightRed":"#f38ba8","brightGreen":"#a6e3a1","brightYellow":"#f9e2af","brightBlue":"#89b4fa","brightMagenta":"#cba6f7","brightCyan":"#94e2d5","brightWhite":"#ffffff","background":"#1e1e2e","foreground":"#cdd6f4","cursor":"#f5e0dc","selection":"#45475a"}

Type "DEMO_DIR=$(mktemp -d)"
Enter
Sleep 300ms
Type 'git -C "$DEMO_DIR" init -q'
Enter
Sleep 300ms
Type 'cd "$DEMO_DIR"'
Enter
Sleep 300ms
Type "STAMP=$(date +%H%M%S)"
Enter
Sleep 300ms
Type 'PROJECT="AXI Demo $STAMP"'
Enter
Sleep 300ms
Type 'ISSUE_TITLE="Demo: wire the agent handoff $STAMP"'
Enter
Sleep 700ms
Ctrl+L
Sleep 500ms

Type "linear-axi"
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type "linear-axi teams list --fields key,name --limit 5"
Enter
Sleep 2s
Type "TEAM=$(linear-axi teams list --fields key --limit 1 | awk '/^  / { print $1; exit }')"
Enter
Sleep 500ms
Ctrl+L
Sleep 500ms

Type 'linear-axi projects list --query "$PROJECT" --fields id,name,status --limit 5'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type 'linear-axi projects create --name "$PROJECT" --team "$TEAM" --summary "Short-lived demo project for the CLI walkthrough" > project.out && cat project.out'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type "PROJECT_ID=$(awk '/  id: / { print $2; exit }' project.out)"
Enter
Sleep 300ms
Type 'linear-axi init --project "$PROJECT"'
Enter
Sleep 1s
Ctrl+L
Sleep 500ms

Type "linear-axi"
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type 'linear-axi issues create --title "$ISSUE_TITLE" --team "$TEAM" --assignee me --priority 2 > issue.out && cat issue.out'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type "ISSUE_ID=$(awk '/  id: / { print $2; exit }' issue.out)"
Enter
Sleep 300ms
Type 'linear-axi issues list --assignee me --project "$PROJECT" --fields id,title,state,priority --limit 5'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type 'linear-axi issues view "$ISSUE_ID"'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type 'linear-axi comments create --issue "$ISSUE_ID" --body "Starting this now; demo captured the project setup and issue lookup."'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type 'linear-axi comments list --issue "$ISSUE_ID"'
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type "linear-axi issues view all"
Enter
Sleep 2s
Ctrl+L
Sleep 500ms

Type 'linear-axi projects update --id "$PROJECT_ID" --state canceled'
Enter
Sleep 2s
