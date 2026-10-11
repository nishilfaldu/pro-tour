### Feature tour: Sample diagram example picker

Diagrams with more than one sample get an example menu; the diagram name still loads the default sample.

**Passed**: 4/4 steps · 25.3s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ A diagram with only one sample, such as Flowchart, stays a plain button with no example menu. (step 1)
- ✓ A diagram with several samples, such as Wardley Maps, shows an example menu beside its name. (step 1)
- ✓ Clicking the diagram name loads its default sample, including after another sample was chosen. (step 1, 4)
- ✓ The example menu lists every sample for that diagram, with the default sample first. (step 2)
- ✓ Choosing a sample from the menu loads that sample into the editor and closes the menu. (step 3)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Click Wardley Maps to load its default sample** (4.9s)
  - ✓ Flowchart has no example menu _(already true before)_
  - ✓ Wardley Maps example menu _(already true before)_
  - ✓ Default sample is Tea Shop
- ✓ **Open the Wardley Maps example menu** (5.8s)
  - ✓ Tea Shop Value Chain
  - ✓ Custom Evolution Stages
  - ✓ Pipeline Components
  - ✓ GPT Tokeniser Architecture
  - ✓ Default sample is listed first
- ✓ **Choose Custom Evolution Stages** (4.8s)
  - ✓ Chosen sample is Data Evolution Pipeline
  - ✓ Tea Shop sample is replaced
  - ✓ Example menu closes
- ✓ **Click Wardley Maps again to restore the default sample** (4.4s)
  - ✓ Default sample is Tea Shop again
  - ✓ Custom sample is replaced

</details>

