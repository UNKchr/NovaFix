import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import {
  evaluatePasswordChecklist,
  type PasswordRequirementsChecklist,
  sanitizedTextValidator,
  strictEmailValidator,
  strongPasswordValidator,
} from '../../../core/validators/security.validators';
import { IconComponent } from '../../../shared/components/icon/icon.component';

type RegisterControlName = 'companyName' | 'adminFullName' | 'adminEmail' | 'adminPassword';

@Component({
  selector: 'app-register-company',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register-company.component.html',
  styleUrl: './register-company.component.css',
})
export class RegisterCompanyComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly showPassword = signal<boolean>(false);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly serverErrorMessage = signal<string | null>(null);
  protected readonly submittedAttempt = signal<boolean>(false);
  protected readonly rawPasswordSignal = signal<string>('');

  protected readonly registerForm = this.fb.group({
    companyName: ['', [sanitizedTextValidator(2, 120)]],
    adminFullName: ['', [sanitizedTextValidator(2, 100)]],
    adminEmail: ['', [strictEmailValidator()]],
    adminPassword: ['', [strongPasswordValidator()]],
  });

  protected readonly passwordChecklist = computed<PasswordRequirementsChecklist>(() => {
    return evaluatePasswordChecklist(this.rawPasswordSignal());
  });

  protected togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected onFieldInput(controlName: RegisterControlName): void {
    if (this.serverErrorMessage()) {
      this.serverErrorMessage.set(null);
    }
    if (controlName === 'adminPassword') {
      this.rawPasswordSignal.set(this.registerForm.controls.adminPassword.value);
    }
  }

  protected isFieldInvalid(controlName: RegisterControlName): boolean {
    const control = this.registerForm.controls[controlName];
    return control.invalid && (control.touched || this.submittedAttempt());
  }

  protected getTextErrorMessage(
    controlName: 'companyName' | 'adminFullName',
    fieldLabel: string,
    maxLength: number,
  ): string | null {
    if (!this.isFieldInvalid(controlName)) {
      return null;
    }
    const errors = this.registerForm.controls[controlName].errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return `${fieldLabel} es obligatorio.`;
    }
    if (errors['unsafeCharacters']) {
      return `${fieldLabel} contiene caracteres no permitidos (<, > o caracteres de control).`;
    }
    if (errors['minlength']) {
      return `${fieldLabel} debe tener al menos 2 caracteres válidos.`;
    }
    if (errors['maxlength']) {
      return `${fieldLabel} no puede superar los ${maxLength} caracteres.`;
    }
    return `Valor inválido para ${fieldLabel}.`;
  }

  protected getEmailErrorMessage(): string | null {
    if (!this.isFieldInvalid('adminEmail')) {
      return null;
    }
    const errors = this.registerForm.controls.adminEmail.errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return 'El correo electrónico del Administrador es obligatorio.';
    }
    if (errors['maxlength']) {
      return 'El correo electrónico no puede superar los 150 caracteres.';
    }
    return 'Ingresa un correo electrónico válido (ej. admin@tuempresa.com).';
  }

  protected getPasswordErrorMessage(): string | null {
    if (!this.isFieldInvalid('adminPassword')) {
      return null;
    }
    const errors = this.registerForm.controls.adminPassword.errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return 'Debes definir una contraseña maestra para el Administrador.';
    }
    return 'La contraseña aún no cumple todos los requisitos de seguridad listados.';
  }

  protected onSubmit(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.submittedAttempt.set(true);
    this.serverErrorMessage.set(null);

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const payload = this.registerForm.getRawValue();
    this.isSubmitting.set(true);

    this.authService
      .registerCompany(payload)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/');
        },
        error: (err: unknown) => {
          this.serverErrorMessage.set(
            this.authService.extractErrorMessage(
              err,
              'No fue posible completar el registro de la empresa.',
            ),
          );
        },
      });
  }
}
