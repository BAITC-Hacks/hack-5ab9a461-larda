[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [int]$TimeoutSeconds = 180,
    [long]$BusinessID = 1,
    [long]$CaptainID = 2,
    [long]$StudentID = 3,
    [long]$TeamID = 1
)

# Run against an API configured with AI_MODE=fallback for a demo without paid calls.
# ASCII source also works in Windows PowerShell 5.1 without encoding changes.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [long]$ActorID = 0,
        [object]$Body = $null
    )
    $options = @{
        Uri = "$BaseUrl$Path"
        Method = $Method
        TimeoutSec = 30
        Headers = @{}
    }
    if ($ActorID -gt 0) { $options.Headers['X-Demo-User-ID'] = [string]$ActorID }
    if ($null -ne $Body) {
        $json = ConvertTo-Json -InputObject $Body -Depth 20 -Compress
        $options.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
        $options.ContentType = 'application/json; charset=utf-8'
    }
    try {
        # Windows PowerShell 5.1 writes JSON arrays as a single pipeline object.
        # Assignment followed by return deliberately enumerates that outer array.
        $response = Invoke-RestMethod @options
        return $response
    } catch {
        $detail = $_.Exception.Message
        if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
        throw "$Method $Path failed: $detail"
    }
}

function Wait-TaskAI {
    param([long]$TaskID)
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $current = Invoke-Api GET "/api/v1/tasks/$TaskID" $BusinessID
        switch ($current.ai_status) {
            'succeeded' { return $current }
            'failed' { throw "AI failed for task ${TaskID}: $($current.ai_error). Use POST /api/v1/tasks/$TaskID/ai/retry after fixing the API configuration." }
            'pending' { }
            'running' { }
            default { throw "Unexpected AI state: $($current.ai_status)" }
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for task $TaskID; inspect GET /api/v1/tasks/$TaskID/ai-jobs as the owner."
}

$null = Invoke-Api GET '/healthz'
$before = @{}
foreach ($id in @($BusinessID, $CaptainID, $StudentID)) {
    $profile = Invoke-Api GET "/api/v1/users/$id"
    $before[$id] = [long]$profile.user.exp
}

Write-Host 'Creating a raw business problem and waiting for clarification questions...'
$task = Invoke-Api POST '/api/v1/tasks' $BusinessID @{
    raw_description = 'Our small cafe loses ingredients because stock is tracked in scattered spreadsheets. We need a simple way for shift managers to see remaining stock and record daily usage.'
    industry = 'hospitality'
    topic = 'inventory'
    tag_ids = @()
}
$taskID = [long]$task.id
$task = Wait-TaskAI $taskID
$questions = @(Invoke-Api GET "/api/v1/tasks/$taskID/questions" $BusinessID)
if ($questions.Count -lt 3 -or $questions.Count -gt 7) { throw "Expected 3..7 clarification questions, received $($questions.Count)." }
Write-Host ("Task {0}: {1} questions, initial preview {2}/100 ({3})" -f $taskID, $questions.Count, $task.draft_evaluation.score, $task.draft_evaluation.source)

# Publish an intentionally incomplete version, then improve its private draft.
$task = Invoke-Api PATCH "/api/v1/tasks/$taskID" $BusinessID @{
    revision = $task.revision
    title = 'Cafe stock dashboard'
}
$task = Wait-TaskAI $taskID
$weakScore = [int]$task.draft_evaluation.score
$task = Invoke-Api POST "/api/v1/tasks/$taskID/confirm" $BusinessID @{ revision = $task.revision }
$task = Invoke-Api POST "/api/v1/tasks/$taskID/publish" $BusinessID
Write-Host ("Published the incomplete card: {0}/100. Low scores do not block publication." -f $weakScore)

$facts = @{
    industry = 'Hospitality: a single small cafe with two daily shifts.'
    topic = 'Inventory management'
    title = 'Cafe stock dashboard'
    context = 'A cafe with 12 employees tracks 80 ingredient items in separate spreadsheets. Shift managers spend 30 minutes reconciling stock each evening and have no shared view.'
    need = 'Provide one shared inventory view and record ingredient usage so shift managers can identify shortages before ordering.'
    target_users = 'Two shift managers record receipts and usage daily; the cafe owner reviews weekly stock and low-stock alerts.'
    available_data = 'An anonymized CSV export with 80 ingredients and 90 days of receipts, usage and ending quantities. Columns: date, ingredient_id, unit, received, used, remaining. The owner supplies the CSV at kickoff through a shared project folder.'
    constraints = 'Deliver a browser prototype in 14 calendar days. Use Go and PostgreSQL, run via Docker Compose on the cafe laptop, support two concurrent managers and avoid paid external services. No customer personal data is needed.'
    expected_result = 'A runnable web prototype, source repository, Docker Compose setup, CSV import, stock list, receipt and usage forms, low-stock indicators, and a short manager guide.'
    success_criteria = 'Import all 80 ingredient rows without loss; balances match all 20 supplied receipt/usage fixtures; each of five manager scenarios passes; low-stock flags match the supplied thresholds; the stock list loads within two seconds on the supplied laptop.'
    contact = 'Demo cafe owner, owner@example.test; contact through the project email thread.'
    interaction_format = 'A 30-minute kickoff and two scheduled 20-minute online reviews each week; asynchronous questions in the shared project email thread.'
    feedback_process = 'The owner reviews each submitted stage against the agreed fixtures within two working days and returns a written accepted/revise decision with concrete comments.'
}
$answers = @(
    foreach ($question in $questions) {
        $answerText = $facts[$question.field_key]
        if ([string]::IsNullOrWhiteSpace($answerText)) {
            $answerText = $facts.context + ' ' + $facts.need + ' ' + $facts.expected_result + ' ' + $facts.success_criteria
        }
        @{ question_id = [long]$question.id; answer = $answerText }
    }
)
$task = Invoke-Api POST "/api/v1/tasks/$taskID/answers" $BusinessID @{
    revision = $task.revision
    answers = $answers
}
$task = Wait-TaskAI $taskID
Write-Host ("After answers: preview {0}/100" -f $task.draft_evaluation.score)

# Fill the remaining communication/details fields in the editable generated card.
$patch = @{ revision = $task.revision }
foreach ($key in $facts.Keys) { $patch[$key] = $facts[$key] }
$task = Invoke-Api PATCH "/api/v1/tasks/$taskID" $BusinessID $patch
$task = Wait-TaskAI $taskID
$improvedScore = [int]$task.draft_evaluation.score
$source = $task.draft_evaluation.source
$public = Invoke-Api GET "/api/v1/tasks/$taskID"
if ([int]$public.readiness_score -ne $weakScore) { throw 'Public score changed before confirmation.' }
Write-Host ("Private improved preview: {0}/100; public score remains {1}/100 until confirmation." -f $improvedScore, $public.readiness_score)
$task = Invoke-Api POST "/api/v1/tasks/$taskID/confirm" $BusinessID @{ revision = $task.revision }
$public = Invoke-Api GET "/api/v1/tasks/$taskID"
if ([int]$public.readiness_score -ne $improvedScore) { throw 'Confirmed score did not become public.' }
Write-Host ("Confirmed score change: {0} -> {1}/100 (source: {2})" -f $weakScore, $improvedScore, $source)

Write-Host 'Captain submits a proposal; business selects the team...'
$proposal = Invoke-Api POST "/api/v1/tasks/$taskID/proposals" $CaptainID @{
    team_id = $TeamID
    solution_idea = 'Build a shared stock dashboard with CSV import and low-stock indicators.'
    plan = 'Verify the supplied CSV, implement the inventory workflow, test the supplied fixtures and demonstrate the prototype.'
    duration_days = 14
    prototype_url = 'https://example.test/cafe-stock/prototype'
}
$proposalID = [long]$proposal.id
$proposal = Invoke-Api POST "/api/v1/proposals/$proposalID/decision" $BusinessID @{ status = 'accepted' }
$stage = Invoke-Api POST "/api/v1/proposals/$proposalID/milestones" $CaptainID @{
    title = 'Working stock prototype and acceptance fixtures'
    description = 'Deliver CSV import, stock changes and low-stock flags with the agreed 20 fixtures and manager guide.'
    position = 1
    exp_reward = 100
}
$stageID = [long]$stage.id
$stage = Invoke-Api POST "/api/v1/milestones/$stageID/approve" $BusinessID
$stage = Invoke-Api POST "/api/v1/milestones/$stageID/submit" $CaptainID @{ result_url = 'https://example.test/cafe-stock/result' }
$stage = Invoke-Api POST "/api/v1/milestones/$stageID/review" $BusinessID @{ accepted = $true }
$proposal = Invoke-Api POST "/api/v1/proposals/$proposalID/complete" $BusinessID
$task = Invoke-Api POST "/api/v1/tasks/$taskID/complete" $BusinessID

Write-Host ("Completed task {0}, proposal {1}, milestone {2}. EXP including achievements:" -f $taskID, $proposalID, $stageID)
$balances = @(
    foreach ($id in @($BusinessID, $CaptainID, $StudentID)) {
        $profile = Invoke-Api GET "/api/v1/users/$id"
        [pscustomobject]@{
            UserID = $id
            Role = $profile.user.role
            Before = $before[$id]
            After = [long]$profile.user.exp
            Earned = [long]$profile.user.exp - $before[$id]
            Achievements = @($profile.achievements).Count
        }
    }
)
$balances | Format-Table -AutoSize
Write-Host ("Public card: {0}/api/v1/tasks/{1}" -f $BaseUrl, $taskID)
