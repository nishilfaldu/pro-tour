### Feature tour: Rename history entries

A saved history entry can be renamed in place. Enter or clicking away saves a trimmed name; Escape or a blank name leaves the current name as it is.

**Passed**: 6/6 steps · 42.5s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ A saved history entry has a Rename control beside its name. (step 1)
- ✓ Rename opens an inline field filled with the current name. (step 2)
- ✓ Pressing Enter saves the name that was typed. (step 3)
- ✓ Spaces around the typed name are removed when it is saved. (step 3)
- ✓ Escape closes the field and keeps the name that was already saved. (step 4)
- ✓ A name made only of spaces is discarded and the current name stays. (step 5)
- ✓ Clicking away from the field saves the name. (step 6)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Save the diagram and open History** (6.2s)
  - ✓ A saved entry is listed
  - ✓ Rename control is beside the name
- ✓ **Open the rename field** (4.3s)
  - ✓ The Rename control is replaced by the field
  - ✓ The field is filled with the current name
- ✓ **Type a name with extra spaces and press Enter** (5.9s)
  - ✓ The rename field closes
  - ✓ The list shows the name without surrounding spaces
- ✓ **Press Escape to cancel a rename** (6.7s)
  - ✓ The rename field closes
  - ✓ The saved name is unchanged
- ✓ **Clear the name to spaces and press Enter** (6.2s)
  - ✓ The rename field closes
  - ✓ The current name stays
- ✓ **Click away from the field to save** (7.6s)
  - ✓ The rename field closes
  - ✓ The name is saved

</details>

