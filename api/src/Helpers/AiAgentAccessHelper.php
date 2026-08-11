<?php

declare(strict_types=1);

namespace App\Helpers;

final class AiAgentAccessHelper
{
    public const FITUR_AGENT_USE = 'action.chat_ai.agent.use';

    public const FITUR_AGENT_CONFIRM_WRITE = 'action.chat_ai.agent.confirm_write';

    public const FITUR_MODE_ALTERNATIF = 'action.chat_ai.ui.mode_alternatif';

    public static function bypassFiturChecks(array $user): bool
    {
        if (!empty($user['is_real_super_admin'])) {
            return true;
        }

        return RoleHelper::tokenHasAnyRoleKey($user, ['super_admin']);
    }

    public static function canUseAgent(\PDO $db, array $user): bool
    {
        if (self::bypassFiturChecks($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::FITUR_AGENT_USE);
    }

    public static function canConfirmAgentWrites(\PDO $db, array $user): bool
    {
        if (self::bypassFiturChecks($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::FITUR_AGENT_CONFIRM_WRITE);
    }

    public static function canUseAlternativeChatMode(\PDO $db, array $user): bool
    {
        if (self::bypassFiturChecks($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::FITUR_MODE_ALTERNATIF);
    }
}
