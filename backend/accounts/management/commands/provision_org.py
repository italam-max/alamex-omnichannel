"""
Provision a new client organization (operator flow).

Creates the Organization, an admin user + Agent + Membership, and the per-org
singletons (Workspace, AIConfig, CreditAccount). Idempotent.

  python manage.py provision_org --name "Acme" --admin-email admin@acme.mx \
      --password 'TempPass123!' --credits 20
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from accounts.models import Organization, Membership, Agent, Workspace
from accounts.tenancy import use_organization
from knowledge.models import AIConfig
from billing.models import CreditAccount

User = get_user_model()


class Command(BaseCommand):
    help = 'Provision a new client organization with an admin user.'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True)
        parser.add_argument('--slug', default=None)
        parser.add_argument('--admin-email', required=True, dest='admin_email')
        parser.add_argument('--password', default='Almenara123!')
        parser.add_argument('--credits', type=float, default=0.0)

    def handle(self, *args, **o):
        slug = o['slug'] or slugify(o['name'])
        org, created = Organization.objects.get_or_create(
            slug=slug, defaults={'name': o['name']})
        self.stdout.write(self.style.SUCCESS(
            f"Organización {'creada' if created else 'existente'}: {org.name} ({org.slug})"))

        # Admin user + agent + membership.
        email = o['admin_email']
        user, u_created = User.objects.get_or_create(
            username=email, defaults={'email': email, 'is_staff': False})
        if u_created:
            user.set_password(o['password'])
            user.save()
        agent, _ = Agent.objects.get_or_create(
            user=user, defaults={'display_name': o['name'] + ' Admin',
                                 'role': Agent.ROLE_ADMIN, 'organization': org})
        if agent.organization_id != org.id:
            agent.organization = org
            agent.role = Agent.ROLE_ADMIN
            agent.save(update_fields=['organization', 'role'])
        Membership.objects.get_or_create(
            user=user, organization=org, defaults={'role': 'admin', 'is_default': True})

        # Per-org singletons (created inside the org context so they're stamped).
        with use_organization(org):
            ws = Workspace.get_for_org(org)
            ws.company_name = o['name']
            ws.save(update_fields=['company_name'])
            AIConfig.get_for_org(org)
            account = CreditAccount.get_for_org(org)
            if o['credits']:
                account.balance_usd += Decimal(str(o['credits']))
                account.save(update_fields=['balance_usd', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(
            f"Admin: {email} (password {'nuevo' if u_created else 'sin cambios'}) · "
            f"créditos: ${account.balance_usd}"))
        self.stdout.write(self.style.SUCCESS('Listo. La organización está provisionada.'))
