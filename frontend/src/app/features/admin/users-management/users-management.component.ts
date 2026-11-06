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
  getPresetDefaultPermissions,
  PERMISSION_CATALOG,
  type PermissionCode,
  type PermissionPreset,
  PRESET_CATALOG,
} from '../../../core/models/auth.model';
import type { UpdateUserPayload, UserSummaryView } from '../../../core/models/user.model';
import { AreasService } from '../../../core/services/areas.service';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import { UsersService } from '../../../core/services/users.service';
import {
  evaluatePasswordChecklist,
  generateCryptographicPassword,
  optionalStrongPasswordValidator,
  type PasswordRequirementsChecklist,
  sanitizedTextValidator,
  strictEmailValidator,
  strongPasswordValidator,
  uuidValidator,
} from '../../../core/validators/security.validators';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-management.component.html',
  styleUrl: './users-management.component.css',
})
export class UsersManagementComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeSync = inject(RealtimeSyncService);
  protected readonly usersService = inject(UsersService);
  protected readonly areasService = inject(AreasService);
  protected readonly authService = inject(AuthService);

  private readonly deleteDialogRef =
    viewChild<ElementRef<HTMLDialogElement>>('deleteUserDialog');

  protected readonly presetCatalog = PRESET_CATALOG;
  protected readonly permissionCatalog = PERMISSION_CATALOG;

  protected readonly canManageUsers = computed<boolean>(() =>
    this.authService.hasPermission('MANAGE_USERS'),
  );

  protected readonly isFormOpen = signal<boolean>(false);
  protected readonly editingUser = signal<UserSummaryView | null>(null);
  protected readonly showPassword = signal<boolean>(false);
  protected readonly rawPasswordSignal = signal<string>('');
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly submittedAttempt = signal<boolean>(false);
  protected readonly feedbackMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedAreaIdSignal = signal<string>('');
  protected readonly selectedPresetSignal = signal<PermissionPreset>('RECEPTION_AGENT');
  protected readonly selectedCustomPermissions = signal<ReadonlySet<PermissionCode>>(new Set());
  protected readonly pendingDeleteUser = signal<UserSummaryView | null>(null);

  protected readonly userForm = this.fb.group({
    fullName: ['', [sanitizedTextValidator(2, 100)]],
    email: ['', [strictEmailValidator()]],
    areaId: ['', [uuidValidator()]],
    password: ['', [strongPasswordValidator()]],
    permissionPreset: ['RECEPTION_AGENT' as PermissionPreset],
    isActive: [true],
  });

  protected readonly passwordChecklist = computed<PasswordRequirementsChecklist>(() =>
    evaluatePasswordChecklist(this.rawPasswordSignal()),
  );

  protected readonly selectedAreaObject = computed<AreaSummaryView | null>(() => {
    const id = this.selectedAreaIdSignal();
    return this.areasService.areas().find((a) => a.id === id) ?? null;
  });

  protected readonly inheritedPermissionsSet = computed<ReadonlySet<PermissionCode>>(() => {
    const set = new Set<PermissionCode>();
    for (const code of getPresetDefaultPermissions(this.selectedPresetSignal())) {
      set.add(code);
    }
    const area = this.selectedAreaObject();
    if (area) {
      for (const code of getPresetDefaultPermissions(area.defaultPreset)) {
        set.add(code);
      }
      for (const code of area.permissions) {
        set.add(code);
      }
    }
    return set;
  });

  protected readonly effectivePreviewPermissions = computed<ReadonlyArray<PermissionCode>>(() => {
    const area = this.selectedAreaObject();
    return computeEffectivePermissions({
      userPreset: this.selectedPresetSignal(),
      areaPreset: area?.defaultPreset ?? null,
      areaPermissions: area?.permissions ?? [],
      customPermissions: Array.from(this.selectedCustomPermissions()),
    });
  });

  public ngOnInit(): void {
    this.reloadDirectory();

    this.realtimeSync.registerAutoRefresh({
      destroyRef: this.destroyRef,
      intervalMs: 10000,
      onRefresh: () => this.refreshDirectorySilently(),
    });
  }

  protected reloadDirectory(): void {
    this.errorMessage.set(null);
    this.areasService.loadAreas().subscribe();
    this.usersService.loadUsers().subscribe({
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(
            err,
            'No fue posible cargar el directorio de personal.',
          ),
        );
      },
    });
  }

  private refreshDirectorySilently(): void {
    if (this.isSubmitting()) {
      return;
    }
    this.areasService.loadAreas({ silent: true }).subscribe({
      error: () => {
        // Ignore transient background errors
      },
    });
    this.usersService.loadUsers({ silent: true }).subscribe({
      error: () => {
        // Ignore transient background errors
      },
    });
  }

  protected openCreateUserForm(): void {
    const defaultArea = this.areasService.areas()[0] ?? null;
    const initialPreset = defaultArea?.defaultPreset ?? 'RECEPTION_AGENT';

    this.editingUser.set(null);
    this.submittedAttempt.set(false);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);
    this.showPassword.set(false);
    this.rawPasswordSignal.set('');

    this.userForm.controls.email.enable();
    this.userForm.controls.password.setValidators([strongPasswordValidator()]);
    this.userForm.controls.password.updateValueAndValidity();

    this.userForm.reset({
      fullName: '',
      email: '',
      areaId: defaultArea?.id ?? '',
      password: '',
      permissionPreset: initialPreset,
      isActive: true,
    });

    this.selectedAreaIdSignal.set(defaultArea?.id ?? '');
    this.selectedPresetSignal.set(initialPreset);
    this.selectedCustomPermissions.set(new Set());
    this.isFormOpen.set(true);
  }

  protected openEditUserForm(user: UserSummaryView): void {
    const fallbackAreaId = user.areaId ?? this.areasService.areas()[0]?.id ?? '';

    this.editingUser.set(user);
    this.submittedAttempt.set(false);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);
    this.showPassword.set(false);
    this.rawPasswordSignal.set('');

    this.userForm.controls.email.disable();
    this.userForm.controls.password.setValidators([optionalStrongPasswordValidator()]);
    this.userForm.controls.password.updateValueAndValidity();

    this.userForm.reset({
      fullName: user.fullName,
      email: user.email,
      areaId: fallbackAreaId,
      password: '',
      permissionPreset: user.permissionPreset,
      isActive: user.isActive,
    });

    this.selectedAreaIdSignal.set(fallbackAreaId);
    this.selectedPresetSignal.set(user.permissionPreset);
    this.selectedCustomPermissions.set(new Set(user.customPermissions));
    this.isFormOpen.set(true);
  }

  protected closeForm(): void {
    this.isFormOpen.set(false);
    this.editingUser.set(null);
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  protected generateSecurePassword(): void {
    const generated = generateCryptographicPassword(16);
    this.userForm.controls.password.setValue(generated);
    this.userForm.controls.password.markAsDirty();
    this.rawPasswordSignal.set(generated);
    this.showPassword.set(true);
  }

  protected onPasswordInput(): void {
    this.rawPasswordSignal.set(this.userForm.controls.password.value);
  }

  protected onAreaChange(event: Event): void {
    const areaId = (event.target as HTMLSelectElement | null)?.value ?? '';
    this.selectedAreaIdSignal.set(areaId);
    const area = this.areasService.areas().find((a) => a.id === areaId);
    if (area && !this.editingUser()) {
      this.onPresetSelect(area.defaultPreset);
    }
  }

  protected onPresetSelect(preset: PermissionPreset): void {
    this.userForm.controls.permissionPreset.setValue(preset);
    this.selectedPresetSignal.set(preset);
  }

  protected toggleCustomPermission(code: PermissionCode, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked === true;
    this.selectedCustomPermissions.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  }

  protected isInheritedPermission(code: PermissionCode): boolean {
    return this.inheritedPermissionsSet().has(code);
  }

  protected isCustomPermissionChecked(code: PermissionCode): boolean {
    return this.selectedCustomPermissions().has(code);
  }

  protected isFieldInvalid(
    controlName: 'fullName' | 'email' | 'areaId' | 'password',
  ): boolean {
    const control = this.userForm.controls[controlName];
    return control.invalid && (control.touched || this.submittedAttempt());
  }

  protected getPresetLabel(preset: PermissionPreset): string {
    return this.presetCatalog.find((p) => p.preset === preset)?.label ?? preset;
  }

  protected onSubmitUser(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.submittedAttempt.set(true);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const raw = this.userForm.getRawValue();
    const customPermissions = Array.from(this.selectedCustomPermissions());
    const currentEditing = this.editingUser();

    this.isSubmitting.set(true);

    if (currentEditing) {
      const updatePayload: UpdateUserPayload = {
        fullName: raw.fullName.trim(),
        areaId: raw.areaId.trim(),
        permissionPreset: raw.permissionPreset,
        customPermissions,
        isActive: raw.isActive,
        ...(raw.password.length > 0 ? { password: raw.password } : {}),
      };

      this.usersService
        .updateUser(currentEditing.id, updatePayload)
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (updated) => {
            this.feedbackMessage.set(
              `Usuario "${updated.fullName}" actualizado y permisos sincronizados.`,
            );
            this.closeForm();
            this.realtimeSync.triggerCrossViewSync();
          },
          error: (err: unknown) => {
            this.errorMessage.set(
              this.authService.extractErrorMessage(err, 'No fue posible actualizar el usuario.'),
            );
          },
        });
    } else {
      this.usersService
        .createUser({
          fullName: raw.fullName.trim(),
          email: raw.email.trim().toLowerCase(),
          password: raw.password,
          areaId: raw.areaId.trim(),
          permissionPreset: raw.permissionPreset,
          customPermissions,
        })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (created) => {
            this.feedbackMessage.set(
              `Usuario "${created.fullName}" creado exitosamente con sus permisos activos.`,
            );
            this.closeForm();
            this.realtimeSync.triggerCrossViewSync();
          },
          error: (err: unknown) => {
            this.errorMessage.set(
              this.authService.extractErrorMessage(err, 'No fue posible crear el usuario.'),
            );
          },
        });
    }
  }

  protected promptDeleteUser(user: UserSummaryView): void {
    this.pendingDeleteUser.set(user);
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

    const targetUser = this.pendingDeleteUser();
    this.pendingDeleteUser.set(null);

    if (action !== 'confirm-delete' || !targetUser) {
      return;
    }

    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    this.usersService.deleteUser(targetUser.id).subscribe({
      next: (result) => {
        const reassignedMsg =
          result.reassignedOrdersCount > 0
            ? ` Se reasignaron automáticamente ${result.reassignedOrdersCount} órdenes activas sin pérdida de historial.`
            : '';
        this.feedbackMessage.set(
          `El usuario "${targetUser.fullName}" fue dado de baja.${reassignedMsg}`,
        );
        this.realtimeSync.triggerCrossViewSync();
      },
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(
            err,
            'No fue posible dar de baja al usuario seleccionado.',
          ),
        );
      },
    });
  }
}
