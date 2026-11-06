import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { strictEmailValidator } from '../../../core/validators/security.validators';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly showPassword = signal<boolean>(false);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly serverErrorMessage = signal<string | null>(null);
  protected readonly submittedAttempt = signal<boolean>(false);

  protected readonly loginForm = this.fb.group({
    email: ['', [strictEmailValidator()]],
    password: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(128)]],
  });

  protected togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected onFieldInput(): void {
    if (this.serverErrorMessage()) {
      this.serverErrorMessage.set(null);
    }
  }

  protected isFieldInvalid(controlName: 'email' | 'password'): boolean {
    const control = this.loginForm.controls[controlName];
    return control.invalid && (control.touched || this.submittedAttempt());
  }

  protected getEmailErrorMessage(): string | null {
    if (!this.isFieldInvalid('email')) {
      return null;
    }
    const errors = this.loginForm.controls.email.errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return 'El correo electrónico corporativo es obligatorio.';
    }
    if (errors['maxlength']) {
      return 'El correo electrónico no puede superar los 150 caracteres.';
    }
    return 'Ingresa un formato de correo electrónico válido.';
  }

  protected getPasswordErrorMessage(): string | null {
    if (!this.isFieldInvalid('password')) {
      return null;
    }
    const errors = this.loginForm.controls.password.errors;
    if (!errors) {
      return null;
    }
    if (errors['required'] || errors['minlength']) {
      return 'Debes ingresar tu contraseña de acceso.';
    }
    if (errors['maxlength']) {
      return 'La contraseña excede la longitud máxima permitida (128 caracteres).';
    }
    return 'Contraseña inválida.';
  }

  protected onSubmit(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.submittedAttempt.set(true);
    this.serverErrorMessage.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.isSubmitting.set(true);

    this.authService
      .login({ email, password })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/');
        },
        error: (err: unknown) => {
          this.serverErrorMessage.set(
            this.authService.extractErrorMessage(
              err,
              'Credenciales inválidas o cuenta no autorizada.',
            ),
          );
        },
      });
  }
}
