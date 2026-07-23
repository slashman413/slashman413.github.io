---
title: "Cron Expressions Explained: A Practical Guide with Examples"
description: "Understand the 5-field cron syntax, common schedules, the special characters (* / , - ?), timezone and overlap gotchas, plus examples for Linux crontab and GitHub Actions."
date: 2026-07-16
lastmod: 2026-07-16
slug: "cron-expression-guide"
---
<p>Cron is the scheduler that has quietly run the world's servers for decades, and its little strings of numbers and asterisks now show up everywhere — Linux boxes, GitHub Actions workflows, Kubernetes CronJobs, cloud schedulers. Once you can read a line like <code>0 9 * * 1-5</code> at a glance ("9am every weekday"), the whole thing stops being intimidating. This guide breaks down the syntax field by field, gives you a table of schedules you'll actually reuse, and covers the gotchas that cause jobs to fire at the wrong time — or never.</p>

  <h2>The five fields</h2>
  <p>A standard cron expression is five space-separated fields, read left to right in increasing time span:</p>
  <p><code>┌ minute (0-59)<br>│ ┌ hour (0-23)<br>│ │ ┌ day of month (1-31)<br>│ │ │ ┌ month (1-12)<br>│ │ │ │ ┌ day of week (0-6, Sun=0)<br>* * * * *</code></p>
  <p>Each field says "run when the current time matches this." Five asterisks means "every minute of every hour of every day" — the most frequent standard schedule. You narrow it down by replacing asterisks with numbers or ranges. So <code>30 8 * * *</code> reads as "at minute 30 of hour 8, on any day, any month, any weekday" — i.e. 8:30 every morning.</p>
  <p>A quick note on the day fields: day-of-month and day-of-week are a little unusual. If you specify <em>both</em> as something other than <code>*</code>, most cron implementations run the job when <strong>either</strong> matches, not both — a frequent source of surprise.</p>

  <h2>Common schedules to copy</h2>
  <table>
    <tr><th>Expression</th><th>Meaning</th></tr>
    <tr><td><code>* * * * *</code></td><td>Every minute</td></tr>
    <tr><td><code>*/5 * * * *</code></td><td>Every 5 minutes</td></tr>
    <tr><td><code>0 * * * *</code></td><td>At the top of every hour</td></tr>
    <tr><td><code>0 9 * * *</code></td><td>Every day at 9:00</td></tr>
    <tr><td><code>0 9 * * 1-5</code></td><td>9:00 on weekdays (Mon–Fri)</td></tr>
    <tr><td><code>0 0 * * 0</code></td><td>Midnight every Sunday</td></tr>
    <tr><td><code>30 2 1 * *</code></td><td>2:30 on the 1st of every month</td></tr>
    <tr><td><code>0 0 1 1 *</code></td><td>Midnight on January 1st (yearly)</td></tr>
    <tr><td><code>0 */6 * * *</code></td><td>Every 6 hours (00, 06, 12, 18)</td></tr>
    <tr><td><code>0 8,20 * * *</code></td><td>At 08:00 and 20:00 daily</td></tr>
  </table>

  <h2>The special characters</h2>
  <ul>
    <li><code>*</code> — <strong>any value</strong>. Matches every value the field allows.</li>
    <li><code>,</code> — <strong>list</strong>. <code>1,15,30</code> in the minute field runs at minutes 1, 15 and 30.</li>
    <li><code>-</code> — <strong>range</strong>. <code>1-5</code> in the weekday field means Monday through Friday.</li>
    <li><code>/</code> — <strong>step</strong>. <code>*/15</code> means "every 15", i.e. 0, 15, 30, 45. You can combine it with a range: <code>0-30/10</code> is 0, 10, 20, 30.</li>
    <li><code>?</code> — <strong>no specific value</strong>. Used in the day-of-month or day-of-week field in Quartz-style cron (Java, some cloud schedulers) to avoid the either/or ambiguity above. Standard Linux cron does <em>not</em> support <code>?</code>.</li>
  </ul>
  <p>Many crons also accept nicknames like <code>@daily</code>, <code>@hourly</code>, <code>@weekly</code> and <code>@reboot</code>. They're readable, but note that <code>@reboot</code> is unrelated to a clock time — it runs once when the scheduler starts.</p>

  

  <h2>Gotchas that bite people</h2>
  <ul>
    <li><strong>Timezone.</strong> Traditional Linux cron runs in the server's local time, while GitHub Actions and many cloud schedulers run in <strong>UTC</strong>. A job set for "9am" can fire hours off if you assumed the wrong zone — and daylight-saving shifts can move it by an hour twice a year.</li>
    <li><strong>Overlap.</strong> If a job runs every 5 minutes but sometimes takes 7 minutes, a second copy can start before the first finishes. Guard long jobs with a lock file or a tool like <code>flock</code>.</li>
    <li><strong>The either/or day trap.</strong> As noted, setting both day-of-month and day-of-week usually means "either", not "both".</li>
    <li><strong>Missed runs while asleep.</strong> Standard cron does not "catch up" on jobs it missed while the machine was off. If that matters, use <code>anacron</code> or a scheduler with catch-up semantics.</li>
    <li><strong>No sub-minute precision.</strong> Standard cron's finest granularity is one minute. For anything faster you need a different mechanism.</li>
  </ul>

  

  <h2>Where you'll write them</h2>
  <p><strong>Linux crontab.</strong> Run <code>crontab -e</code> to edit your user's jobs. Each line is a five-field expression followed by the command:</p>
  <p><code>0 3 * * * /usr/bin/backup.sh</code></p>
  <p>That runs the backup script at 3am daily. Because cron uses a minimal environment, always use absolute paths and redirect output (e.g. <code>&gt;&gt; /var/log/backup.log 2&gt;&amp;1</code>) so failures aren't silent.</p>
  <p><strong>GitHub Actions.</strong> The <code>schedule</code> trigger takes the same five-field syntax, in UTC, and the expression must be quoted:</p>
  <p><code>on:<br>&nbsp;&nbsp;schedule:<br>&nbsp;&nbsp;&nbsp;&nbsp;- cron: '0 6 * * *'</code></p>
  <p>One caveat worth knowing: scheduled GitHub Actions runs are best-effort and can be delayed during periods of high load, so don't rely on them for second-precise timing. For anything time-critical, a dedicated scheduler is safer.</p>

  <h2>FAQ</h2>
  <p><strong>Is Sunday 0 or 7?</strong> Sunday is <code>0</code> in most crons, and many also accept <code>7</code> for Sunday. Weekdays run 1 (Monday) to 6 (Saturday).</p>
  <p><strong>What's the difference between five and six fields?</strong> The classic Unix format has five fields (minute–weekday). Quartz-style cron (Java, some AWS services) adds a leading seconds field and a trailing optional year, giving six or seven.</p>
  <p><strong>Why didn't my job run?</strong> Usual suspects: wrong timezone, a relative path cron couldn't resolve, missing environment variables, or the file not being executable.</p>
  <p><strong>Can cron run every 30 seconds?</strong> Not directly — one minute is the floor. Workarounds include running the job every minute and having it sleep 30 seconds, or using a different scheduler.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
