import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { AreaSummaryView } from '../../../core/models/area.model';
import {
  computeEffectivePermissions,
  PERMISSION_CATALOG,
  type PermissionCode,
  type PermissionPreset,
  PRESET_CATALOG,
} from '../../../core/models/auth.model';
import { AreasService } from '../../../core/services/areas.service';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import {
  optionalSanitizedTextValidator,
  sanitizedTextValidator,
} from '../../../core/validators/security.validators';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-areas-management',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './areas-management.component.html',
  styleUrl: './areas-management.component.css',
})
export class AreasManagementComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeSync = inject(RealtimeSyncService);
  protected readonly areasService = inject(AreasService);
  protected readonly authService = inject(AuthService);

  private readonly deleteDialogRef =
    viewChild<ElementRef<HTMLDialogElement>>('deleteAreaDialog');

  protected readonly presetCatalog = PRESET_CATALOG;
  protected readonly permissionCatalog = PERMISSION_CATALOG;

  protected readonly isFormOpen = signal<boolean>(false);
  protected readonly editingAreaId = signal<string | null>(null);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly submittedAttempt = signal<boolean>(false);
  protected readonly feedbackMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedPresetSignal = signal<PermissionPreset>('RECEPTION_AGENT');
  protected readonly selectedExtraPermissions = signal<ReadonlySet<PermissionCode>>(new Set());
  protected readonly pendingDeleteArea = signal<AreaSummaryView | null>(null);

  protected readonly areaForm = this.fb.group({
    name: ['', [sanitizedTextValidator(2, 80)]],
    description: ['', [optionalSanitizedTextValidator(2, 255)]],
    isTechnicalQueue: [false],
    defaultPreset: ['RECEPTION_AGENT' as PermissionPreset],
  });

  protected readonly effectivePreviewPermissions = computed<ReadonlyArray<PermissionCode>>(() => {
    return computeEffectivePermissions({
      userPreset: this.selectedPresetSignal(),
      customPermissions: Array.from(this.selectedExtraPermissions()),
    });
  });

  public ngOnInit(): void {
    this.reloadAreas();

    this.realtimeSync.registerAutoRefresh({
      destroyRef: this.destroyRef,
      intervalMs: 10000,
      onRefresh: () => this.refreshAreasSilently(),
    });
  }

  protected reloadAreas(): void {
    this.errorMessage.set(null);
    this.areasService.loadAreas().subscribe({
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(err, 'No se pudieron cargar las áreas operativas.'),
        );
      },
    });
  }

  private refreshAreasSilently(): void {
    if (this.isSubmitting()) {
      return;
    }
    this.areasService.loadAreas({ silent: true }).subscribe({
      error: () => {
        // Ignore transient background errors
      },
    });
  }

  protected openCreateForm(): void {
    this.editingAreaId.set(null);
    this.submittedAttempt.set(false);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);
    this.areaForm.reset({
      name: '',
      description: '',
      isTechnicalQueue: false,
      defaultPreset: 'RECEPTION_AGENT',
    });
    this.selectedPresetSignal.set('RECEPTION_AGENT');
    this.selectedExtraPermissions.set(new Set());
    this.isFormOpen.set(true);
  }

  protected openEditForm(area: AreaSummaryView): void {
    this.editingAreaId.set(area.id);
    this.submittedAttempt.set(false);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);
    this.areaForm.reset({
      name: area.name,
      description: area.description ?? '',
      isTechnicalQueue: area.isTechnicalQueue,
      defaultPreset: area.defaultPreset,
    });
    this.selectedPresetSignal.set(area.defaultPreset);
    this.selectedExtraPermissions.set(new Set(area.permissions));
    this.isFormOpen.set(true);
  }

  protected closeForm(): void {
    this.isFormOpen.set(false);
    this.editingAreaId.set(null);
  }

  protected onModeChange(isTechnical: boolean): void {
    this.areaForm.controls.isTechnicalQueue.setValue(isTechnical);
    const recommendedPreset: PermissionPreset = isTechnical
      ? 'TECHNICAL_SPECIALIST'
      : 'RECEPTION_AGENT';
    this.onPresetSelect(recommendedPreset);
  }

  protected onPresetSelect(preset: PermissionPreset): void {
    this.areaForm.controls.defaultPreset.setValue(preset);
    this.selectedPresetSignal.set(preset);
  }

  protected toggleExtraPermission(code: PermissionCode, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked === true;
    this.selectedExtraPermissions.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  }

  protected isExtraPermissionSelected(code: PermissionCode): boolean {
    return this.selectedExtraPermissions().has(code);
  }

  protected isFieldInvalid(controlName: 'name' | 'description'): boolean {
    const control = this.areaForm.controls[controlName];
    return control.invalid && (control.touched || this.submittedAttempt());
  }

  protected getPresetLabel(preset: PermissionPreset): string {
    return this.presetCatalog.find((p) => p.preset === preset)?.label ?? preset;
  }

  protected onSubmitArea(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.submittedAttempt.set(true);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    if (this.areaForm.invalid) {
      this.areaForm.markAllAsTouched();
      return;
    }

    const raw = this.areaForm.getRawValue();
    const permissions = Array.from(this.selectedExtraPermissions());
    const editId = this.editingAreaId();

    this.isSubmitting.set(true);

    if (editId) {
      const trimmedDesc = raw.description.trim();
      this.areasService
        .updateArea(editId, {
          name: raw.name.trim(),
          description: trimmedDesc.length > 0 ? trimmedDesc : null,
          isTechnicalQueue: raw.isTechnicalQueue,
          defaultPreset: raw.defaultPreset,
          permissions,
        })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (updated) => {
            this.feedbackMessage.set(`Área "${updated.name}" actualizada exitosamente.`);
            this.closeForm();
            this.realtimeSync.triggerCrossViewSync();
          },
          error: (err: unknown) => {
            this.errorMessage.set(
              this.authService.extractErrorMessage(err, 'No fue posible actualizar el área.'),
            );
          },
        });
    } else {
      const trimmedDesc = raw.description.trim();
      this.areasService
        .createArea({
          name: raw.name.trim(),
          ...(trimmedDesc.length > 0 ? { description: trimmedDesc } : {}),
          isTechnicalQueue: raw.isTechnicalQueue,
          defaultPreset: raw.defaultPreset,
          permissions,
        })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (created) => {
            this.feedbackMessage.set(`Área "${created.name}" creada exitosamente.`);
            this.closeForm();
            this.realtimeSync.triggerCrossViewSync();
          },
          error: (err: unknown) => {
            this.errorMessage.set(
              this.authService.extractErrorMessage(err, 'No fue posible crear el área.'),
            );
          },
        });
    }
  }

  protected promptDeleteArea(area: AreaSummaryView): void {
    this.pendingDeleteArea.set(area);
    const dialogEl = this.deleteDialogRef()?.nativeElement;
    if (dialogEl && !dialogEl.open) {
      dialogEl.returnValue = '';
      dialogEl.showModal();
    }
  }

  protected onDeleteDialogClose(event: Event): void {
    const dialogEl = event.target as HTMLDialogElement;
    const action = dialogEl.returnValue;
    dialogEl.returnValue = '';

    const targetArea = this.pendingDeleteArea();
    this.pendingDeleteArea.set(null);

    if (action !== 'confirm-delete' || !targetArea) {
      return;
    }

    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    this.areasService.deleteArea(targetArea.id).subscribe({
      next: () => {
        this.feedbackMessage.set(
          `El área "${targetArea.name}" fue dada de baja exitosamente.`,
        );
        this.realtimeSync.triggerCrossViewSync();
      },
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(
            err,
            'No se pudo dar de baja el área seleccionada.',
          ),
        );
      },
    });
  }
}
