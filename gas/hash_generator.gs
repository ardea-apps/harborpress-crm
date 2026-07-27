function generateHash() {
  const password = Browser.inputBox('Enter password to hash:', Browser.Buttons.OK_CANCEL);
  if (password === 'cancel' || !password) return;
  const hash = hashPassword(password);
  Browser.msgBox('Password Hash', hash + '\n\nCopy this into column B of the Admin tab.', Browser.Buttons.OK);
}

