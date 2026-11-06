import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICON_REGISTRY, type IconName } from './icon-registry';

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="nf-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.role]="ariaLabel() ? 'img' : null"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-hidden]="ariaLabel() ? null : 'true'"
      focusable="false"
    >
      @for (pathData of paths(); track pathData) {
        <path [attr.d]="pathData" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex-shrink: 0;
    }

    .nf-icon {
      display: block;
      fill: currentColor;
    }
  `,
})
export class IconComponent {
  public readonly name = input.required<IconName>();
  public readonly size = input<number>(18);
  public readonly ariaLabel = input<string | null>(null);

  protected readonly paths = computed<readonly string[]>(() => {
    return ICON_REGISTRY[this.name()];
  });
}
