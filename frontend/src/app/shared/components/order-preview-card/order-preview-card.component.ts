import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-registry';

export type OrderPreviewStatus =
  | 'CREATED'
  | 'ASSIGNING'
  | 'DIAGNOSING'
  | 'IN_REPAIR'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface OrderPreviewItem {
  readonly id: string;
  readonly ticketCode: string;
  readonly status: OrderPreviewStatus;
  readonly statusLabel: string;
  readonly customerLabel: string;
  readonly deviceModel: string;
  readonly issueSummary: string;
  readonly originArea: string;
  readonly targetArea: string;
  readonly assigneeLabel: string;
  readonly updatedRelative: string;
  readonly priorityLabel: string;
}

@Component({
  selector: 'app-order-preview-card',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="nf-card nf-card--interactive order-card nf-enter"
      [class.order-card--selected]="selected()"
      animate.enter="nf-enter-active"
    >
      <header class="order-card__header">
        <div class="order-card__identity">
          <span class="order-card__ticket">{{ item().ticketCode }}</span>
          <span class="order-card__priority">{{ item().priorityLabel }}</span>
        </div>

        <span
          class="nf-mono-tag"
          [class.nf-mono-tag--inverted]="isEmphasizedStatus()"
        >
          <app-icon [name]="statusIcon()" [size]="13" />
          <span>{{ item().statusLabel }}</span>
        </span>
      </header>

      <div class="order-card__body">
        <h3 class="order-card__device">{{ item().deviceModel }}</h3>
        <p class="order-card__issue">{{ item().issueSummary }}</p>
      </div>

      <dl class="order-card__meta">
        <div class="order-card__meta-row">
          <dt>Ruta de Área</dt>
          <dd>{{ item().originArea }} → {{ item().targetArea }}</dd>
        </div>
        <div class="order-card__meta-row">
          <dt>Responsable</dt>
          <dd>{{ item().assigneeLabel }}</dd>
        </div>
      </dl>

      <footer class="order-card__footer">
        <span class="order-card__timestamp">
          <app-icon name="clock" [size]="14" />
          <span>{{ item().updatedRelative }}</span>
        </span>

        <button
          type="button"
          class="order-card__action"
          (click)="inspectOrder.emit(item())"
          [attr.aria-label]="'Inspeccionar orden ' + item().ticketCode"
        >
          <span>Inspeccionar</span>
          <app-icon name="arrow-up-right" [size]="15" />
        </button>
      </footer>
    </article>
  `,
  styles: `
    .order-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: var(--space-6);
      height: 100%;
    }

    .order-card--selected {
      border-color: var(--color-border-strong);
      background-color: var(--color-bg-subtle);
    }

    .order-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding-bottom: var(--space-4);
      border-bottom: var(--border-hairline);
    }

    .order-card__identity {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .order-card__ticket {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      color: var(--color-text-primary);
      letter-spacing: var(--tracking-mono);
    }

    .order-card__priority {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      letter-spacing: var(--tracking-mono);
      text-transform: uppercase;
    }

    .order-card__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .order-card__device {
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
      color: var(--color-text-primary);
      letter-spacing: var(--tracking-heading);
    }

    .order-card__issue {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: var(--leading-relaxed);
    }

    .order-card__meta {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-2);
      margin: 0;
      padding-top: var(--space-4);
      border-top: var(--border-hairline);
    }

    .order-card__meta-row {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
      font-size: var(--text-xs);
    }

    .order-card__meta-row dt {
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }

    .order-card__meta-row dd {
      margin: 0;
      font-family: var(--font-mono);
      color: var(--color-text-primary);
      text-align: right;
    }

    .order-card__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding-top: var(--space-4);
      border-top: var(--border-hairline);
    }

    .order-card__timestamp {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .order-card__action {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-text-primary);
      border: 1px solid transparent;
      transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
    }

    .order-card__action:hover:not(:disabled) {
      background-color: var(--color-bg-inverse);
      color: var(--color-text-inverse);
      border-color: var(--color-border-strong);
    }
  `,
})
export class OrderPreviewCardComponent {
  public readonly item = input.required<OrderPreviewItem>();
  public readonly selected = input<boolean>(false);

  public readonly inspectOrder = output<OrderPreviewItem>();

  protected readonly isEmphasizedStatus = computed<boolean>(() => {
    const status = this.item().status;
    return status === 'READY' || status === 'IN_REPAIR';
  });

  protected readonly statusIcon = computed<IconName>(() => {
    const status = this.item().status;
    switch (status) {
      case 'READY':
      case 'DELIVERED':
        return 'check';
      case 'IN_REPAIR':
      case 'DIAGNOSING':
        return 'wrench';
      case 'ASSIGNING':
        return 'layers';
      default:
        return 'activity';
    }
  });
}
