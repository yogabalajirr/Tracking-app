import "server-only";
import { badRequest } from "./api";
import type { TenantDb } from "./db";
import type { RuleAction } from "./rules";

/**
 * A rule can name an agent or team by id. Checking they exist at save time
 * turns "my routing silently stopped working" into an error message the admin
 * sees while they are still looking at the form.
 */
export async function validateRuleTargets(
  db: TenantDb,
  actions: RuleAction[],
): Promise<void> {
  for (const action of actions) {
    switch (action.action) {
      case "assign_user": {
        const found = await db.user.findUnique({
          where: { id: action.value },
          select: { id: true },
        });
        if (!found) {
          throw badRequest("That rule assigns to an agent who isn't in this workspace.");
        }
        break;
      }

      case "assign_team": {
        const found = await db.team.findUnique({
          where: { id: action.value },
          select: { id: true },
        });
        if (!found) throw badRequest("That rule assigns to a team that doesn't exist.");
        break;
      }

      case "set_priority": {
        if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(action.value.toUpperCase())) {
          throw badRequest(`"${action.value}" isn't a valid priority.`);
        }
        break;
      }

      case "set_status": {
        // A rule runs at creation time, so it can only set a live status.
        if (!["OPEN", "PENDING", "ON_HOLD"].includes(action.value.toUpperCase())) {
          throw badRequest(`"${action.value}" isn't a status a new ticket can start in.`);
        }
        break;
      }

      case "add_tag": {
        if (action.value.trim().length === 0) {
          throw badRequest("A tag action needs a tag name.");
        }
        break;
      }
    }
  }
}
