/* Exercise the actual grouped menu and tabs, without bypassing application routing. */
async function navigate(page, label) {
  const direct = page
    .locator('.sidebar nav button')
    .filter({ hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') });
  if ((await direct.count()) && !(await direct.first().getAttribute('data-pages'))) {
    await direct.first().click();
    return;
  }
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.sidebar nav button[data-pages]')].some(
        (button) => button.dataset.pages.split('|').includes(name) && !button.disabled,
      ),
    label,
  );
  const opened = await page
    .locator('.sidebar nav button[data-pages]')
    .evaluateAll((buttons, name) => {
      const group = buttons.find((b) => b.dataset.pages.split('|').includes(name));
      if (!group || group.disabled) return false;
      group.click();
      return true;
    }, label);
  if (!opened) throw new Error('No navigation group contains ' + label);
  const tab = page.getByRole('tab', { name: label, exact: true });
  if (await tab.count()) await tab.click();
  else await page.locator('.section-more select').selectOption(label);
}
module.exports = { navigate };
