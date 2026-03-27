const popovers = document.querySelectorAll('[data-challenges-signup-popover="true"]');

class DialogBox {
  readonly dialogElement: HTMLDialogElement;

  constructor(popover: Element) {
    const linkElement: HTMLAnchorElement | null = popover.querySelector('a');
    const dialogElement: HTMLDialogElement | null = popover.querySelector('dialog');
    const formElement: HTMLFormElement | null = popover.querySelector('form');
    const closeButton: HTMLButtonElement | null = popover.querySelector('button[data-close]');

    if (!linkElement || !dialogElement || !formElement || !closeButton) {
      throw new Error(
        `Missing required elements: link: ${linkElement ? '✅' : '🚫'}, dialog: ${dialogElement ? '✅' : '🚫'}, form: ${formElement ? '✅' : '🚫'}, closeButton: ${closeButton ? '✅' : '🚫'}`,
      );
    }

    this.dialogElement = dialogElement;
    this.dialogElement.dataset.success = 'false';

    linkElement.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '#challenges-signup';
      this.dialogElement.dataset.success = 'false';
      dialogElement?.showModal();
    });

    dialogElement.addEventListener('close', () => {
      this.dialogElement.dataset.success = 'false';
      if (window.location.hash === '#challenges-signup') {
        window.location.hash = '';
      }
    });

    formElement.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(formElement);
      const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        newsletterAgree: formData.get('newsletter-agree') === 'on',
      };

      try {
        const response = await fetch('https://swmansion.dev/api/shaderhunt/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        if (response.ok) {
          formElement.reset();
          dialogElement.dataset.success = 'true';
        } else {
          alert('Error submitting form. Please try again.');
        }
      } catch (error) {
        alert('Network error. Please try again.');
        console.error(error);
      }
    });

    closeButton.addEventListener('click', () => {
      dialogElement.close();
    });
  }
}

const dialogBoxes = Array.from(popovers).map((popover) => new DialogBox(popover));

function isElementVisible(element: Element): boolean {
  // Check if the element or any of its ancestors have display: none
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none') {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function getVisibleDialogBox(): DialogBox | undefined {
  // Find a dialog box whose link element is actually visible
  for (let i = 0; i < dialogBoxes.length; i++) {
    const popover = popovers[i];
    const linkElement = popover?.querySelector('a');
    if (linkElement && isElementVisible(linkElement)) {
      return dialogBoxes[i];
    }
  }
  // Fallback to first dialog box if none are visibly rendered
  return dialogBoxes[0];
}

// Check if URL hash indicates popover should be open
if (window.location.hash === '#challenges-signup') {
  const visibleDialogBox = getVisibleDialogBox();
  if (!visibleDialogBox) {
    throw new Error('Expected at least one dialog box');
  }
  visibleDialogBox.dialogElement.showModal();
}
