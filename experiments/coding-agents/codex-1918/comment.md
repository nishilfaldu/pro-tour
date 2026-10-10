### Feature tour: Rename history entries

Give saved diagrams and timeline snapshots names that are easy to recognize.

**Passed**: 7/7 steps · 45.9s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ Saved history entries have a Rename control and an inline editor. (step 1)
- ✓ Pressing Enter saves the new name. (step 3)
- ✓ Pressing Escape keeps the previous name. (step 4)
- ✓ Leaving the editor saves the name with surrounding spaces removed. (step 5)
- ✓ A renamed entry keeps its name after reloading the editor. (step 6)
- ✓ Timeline snapshots can also be renamed. (step 7)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Open saved history and find the rename control** (5s)
  - ✓ Saved diagram
  - ✓ Rename control
- ✓ **Edit the name inline** (3.9s)
  - ✓ Inline name editor
- ✓ **Save a new name with Enter** (5.5s)
  - ✓ New name
  - ✓ Editor closed
- ✓ **Cancel a change with Escape** (6.7s)
  - ✓ Previous name remains
  - ✓ Editor closed
- ✓ **Save a trimmed name by leaving the editor** (7.1s)
  - ✓ Spaces removed
- ✓ **Reload and confirm the name persists** (4.4s)
  - ✓ Saved name persists
- ✓ **Rename a Timeline snapshot** (7.7s)
  - ✓ Timeline name updated

</details>

