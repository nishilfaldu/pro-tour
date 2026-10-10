### Feature tour: Assignee filter

Find tasks by assignee, combine filters, and clear the view.

**Passed**: 7/7 steps · 46.3s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ The Assignee menu can be searched and shows task counts. (step 1)
- ✓ Choosing a person with no tasks shows an empty state with a way to clear filters. (step 2)
- ✓ Choosing a person shows only their tasks and updates the task count. (step 4)
- ✓ Assignee and Status filters work together. (step 5)
- ✓ Unassigned shows tasks with no assignee. (step 6)
- ✓ Clear filters restores Anyone, All statuses, and the full board. (step 3, 7)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Search the Assignee menu and see how many tasks Ana has** (6.5s)
  - ✓ Ana has zero tasks
  - ✓ Other people are filtered out
- ✓ **Choose Ana to see the empty state** (5s)
  - ✓ No tasks assigned to Ana
  - ✓ Zero tasks shown
  - ✓ Clear action in the empty state
- ✓ **Clear the empty view** (4.8s)
  - ✓ Anyone is selected
  - ✓ All tasks return
- ✓ **Show only Priya’s tasks** (6.7s)
  - ✓ Two tasks shown
  - ✓ Release notes remain _(already true before)_
  - ✓ Color palette remains _(already true before)_
  - ✓ Marco’s task is excluded
- ✓ **Combine Priya with To do** (6.3s)
  - ✓ One task matches both filters
  - ✓ To do task remains _(already true before)_
  - ✓ Done task is excluded
- ✓ **Show the unassigned To do task** (6.3s)
  - ✓ Unassigned task appears
  - ✓ Priya’s task is excluded
  - ✓ One unassigned To do task _(already true before)_
- ✓ **Clear both filters from the toolbar** (4.9s)
  - ✓ Anyone is selected again
  - ✓ All statuses is selected again
  - ✓ The full board returns

</details>

