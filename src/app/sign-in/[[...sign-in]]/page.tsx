"use client";

import * as React from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader, Lock, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export default function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  // const { signOut } = useClerk();

  // Handle the submission of the sign-in form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // await signOut();
    if (!isLoaded) return;

    // Start the sign-in process using the email and password provided
    try {
      setIsLoading(true);
      console.log("Email", email, "Password", password);
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      // If sign-in process is complete, set the created session as active
      // and redirect the user
      if (signInAttempt.status === "complete") {
        // console.log("I am In");
        //if signin success then push to dashboard no need to verify form your db as clerk will do for you
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else {
        //show toast message here signin failed plaease login with correct email and pwd
        // If the status is not complete, check why. User may need to
        // complete further steps.
        // toast.error(signInAttempt.message)
        // console.error(JSON.stringify(signInAttempt, null, 2));
        toast.error("Sign in incomplete. Please follow all required steps.");
        console.error(
          "Sign-in not complete:",
          JSON.stringify(signInAttempt, null, 2)
        );
      }
    } catch (err) {
      //toast something went wrong from clerk server side
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      if (err instanceof Error) {
        const error = err?.message || "Sign in failed. Please try again.";

        toast.error(error);
      }
      // console.error("Sign-in error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Display a form to capture the user's email and password
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-indigo-50">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-lg animate-fade-in">
        <h1 className="text-3xl font-semibold text-center text-gray-800 mb-6">
          Sign in
        </h1>
        <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-gray-700 font-medium">
              Enter email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                className="pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-gray-700 font-medium"
            >
              Enter password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                className="pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div
            id="clerk-captcha"
            data-cl-theme="dark"
            data-cl-size="flexible"
          />

          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white transition-all duration-200 shadow-md hover:shadow-lg"
          >
            {isLoading ? <Loader className="animate-spin" /> : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an Account ? <Link href={"/sign-up"}>Sign up</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
