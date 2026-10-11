### Feature tour: Sample diagram examples

Choose a Wardley Maps example from the Sample Diagrams panel, or load its default directly.

**Passed**: 5/5 steps · 27s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ Clicking a diagram name loads its default example. (step 1, 4)
- ✓ A diagram with multiple examples offers a dropdown listing their titles. (step 2)
- ✓ Choosing an example loads its code and closes the dropdown. (step 3)
- ✓ A diagram with one example loads directly without a dropdown. (step 5)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Load the default Wardley map** (3.9s)
  - ✓ Tea Shop code loaded
- ✓ **Open the example picker** (4.8s)
  - ✓ Default example listed
  - ✓ Alternate example listed
  - ✓ More examples listed
- ✓ **Choose another Wardley map** (4.4s)
  - ✓ Data Evolution Pipeline code loaded
  - ✓ Picker closed
- ✓ **Return to the default from the diagram button** (3.9s)
  - ✓ Tea Shop code restored
- ✓ **Load a diagram with one example** (4.4s)
  - ✓ Flowchart code loaded
  - ✓ No Flowchart picker _(already true before)_

</details>

