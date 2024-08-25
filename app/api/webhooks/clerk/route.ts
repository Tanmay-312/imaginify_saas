/* eslint-disable camelcase */
import { clerkClient } from "@clerk/nextjs";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error: Missing Svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }

  const { id, email_addresses, image_url, first_name, last_name, username } = evt.data;

  switch (evt.type) {
    case "user.created":
      const newUser = await createUser({
        clerkId: id,
        email: email_addresses[0].email_address,
        username: username || "",
        firstName: first_name || "",
        lastName: last_name || "",
        photo: image_url || "",
      });

      if (newUser) {
        await clerkClient.users.updateUserMetadata(id, {
          publicMetadata: { userId: newUser._id },
        });
      }

      return NextResponse.json({ message: "User created", user: newUser });

    case "user.updated":
      const updatedUser = await updateUser(id, {
        firstName: first_name || "",
        lastName: last_name || "",
        username: username || "",
        photo: image_url || "",
      });

      return NextResponse.json({ message: "User updated", user: updatedUser });

    case "user.deleted":
      const deletedUser = await deleteUser(id);
      return NextResponse.json({ message: "User deleted", user: deletedUser });

    default:
      return new Response("Unhandled event type", { status: 400 });
  }
}
