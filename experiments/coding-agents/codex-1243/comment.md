### Feature tour: Email normalizer

Normalize a list of email addresses, handle invalid lines, and copy or clear the result.

**Passed**: 5/5 steps · 32.6s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ The Email normalizer page offers a multiline input and an output area. (step 1)
- ✓ Multiple email addresses normalize line by line, including Gmail aliases and letter case. (step 2)
- ✓ An invalid email line shows a clear error while valid lines still normalize. (step 3)
- ✓ The normalized list can be copied to the clipboard. (step 4)
- ✓ Clearing the input removes the results and disables copying. (step 5)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Open the Email normalizer** (4.2s)
  - ✓ Email normalizer page _(already true before)_
  - ✓ Multiline email input
  - ✓ Normalized output
- ✓ **Normalize two email addresses** (5.9s)
  - ✓ Gmail alias and case normalized on separate lines
- ✓ **Show a line-level error for invalid input** (7.7s)
  - ✓ Invalid line identified and valid lines retained
- ✓ **Copy the normalized results** (4.4s)
  - ✓ Copy confirmation
  - ✓ Clipboard contains the normalized list
- ✓ **Clear the email list** (4.8s)
  - ✓ Input cleared
  - ✓ Output cleared
  - ✓ Copy is disabled with no results

</details>

