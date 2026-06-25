"""
Organization provisioning shared by the operator API and the management command.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils.text import slugify

from accounts.models import Organization, Membership, Agent, Workspace, AccessInvite
from accounts.tenancy import use_organization
from knowledge.models import AIConfig
from billing.models import CreditAccount

User = get_user_model()


def provision_organization(name, admin_email, credits=0, slug=None, password=None):
    """Create (or fetch) an organization and its admin user + per-org singletons.

    The admin user is created INACTIVE with an unusable password — they activate
    it through an access link (AccessInvite). Returns (organization, admin_user).
    Idempotent on slug + admin email.
    """
    org_slug = slug or slugify(name) or 'org'
    org, _ = Organization.objects.get_or_create(slug=org_slug, defaults={'name': name})

    user, created = User.objects.get_or_create(
        username=admin_email, defaults={'email': admin_email, 'is_active': False})
    if created:
        if password:
            user.set_password(password)
            user.is_active = True
        else:
            user.set_unusable_password()  # activated via the access link
        user.save()

    Agent.objects.get_or_create(
        user=user, defaults={'display_name': f'{name} Admin',
                             'role': Agent.ROLE_ADMIN, 'organization': org})
    Membership.objects.get_or_create(
        user=user, organization=org, defaults={'role': 'admin', 'is_default': True})

    with use_organization(org):
        ws = Workspace.get_for_org(org)
        if ws.company_name in ('', 'Mi Empresa'):
            ws.company_name = name
            ws.save(update_fields=['company_name'])
        AIConfig.get_for_org(org)
        account = CreditAccount.get_for_org(org)
        if credits:
            account.balance_usd += Decimal(str(credits))
            account.save(update_fields=['balance_usd', 'updated_at'])

    return org, user


def issue_access_link(organization, user):
    """Create a fresh access invite for the user and return the AccessInvite."""
    return AccessInvite.issue(organization, user)
