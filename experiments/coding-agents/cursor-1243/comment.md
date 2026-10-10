### Feature tour: Email normalizer

Normalize a list of email addresses, flag lines that cannot be parsed, copy the result, and clear it.

**Passed**: 5/5 steps · 35.9s video

![](https://github.com/user-attachments/assets/sandbox-1)

**What this PR does**

- ✓ Email normalizer shows up in search and opens its tool page. (step 1)
- ✓ Addresses entered one per line are normalized: lowercased, with Gmail dots and plus-tags removed and googlemail.com rewritten to gmail.com. (step 2)
- ✓ Copy normalized emails puts that list on the clipboard and confirms it. (step 3)
- ✓ An address that cannot be parsed is shown on its own line as "Unable to parse email: ...". (step 4)
- ✓ Clear emails empties both fields and disables copying until there is a result again. (step 5)

<details><summary><b>Steps and checks</b></summary>

- ✓ **Open Email normalizer from search** (8.3s)
  - ✓ Email normalizer heading
  - ✓ Raw email field
  - ✓ Search dialog closes
- ✓ **Normalize a list of addresses** (7.4s)
  - ✓ Each address is normalized
  - ✓ Copy is available
- ✓ **Copy the normalized addresses** (4.3s)
  - ✓ Copy confirmation
  - ✓ Clipboard has the normalized list
- ✓ **Flag an address that cannot be parsed** (5.6s)
  - ✓ Invalid line is reported
- ✓ **Clear the list** (4.8s)
  - ✓ Raw emails are cleared
  - ✓ Normalized emails are cleared
  - ✓ Copy is disabled

</details>

